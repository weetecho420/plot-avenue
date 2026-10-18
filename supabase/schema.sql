-- Plot Avenue schema
-- Matches the live database (Plot Avenue tables live in the shared Sprout
-- Supabase project, next to the sprout_* tables). Safe to re-run: every
-- statement is "if not exists" / "or replace".

-- ───────────────────────── plots ─────────────────────────
create table if not exists plots (
  id uuid primary key default gen_random_uuid(),
  slot_index int not null unique,            -- fixed position in the skyline, 0-based left to right
  tier text not null,                        -- 'kiosk' | 'shop' | 'tower' | 'skyscraper'
  price_cents int not null,                  -- USD cents
  status text not null default 'available',  -- 'available' | 'claimed'
  owner_name text,
  website_url text,
  logo_url text,
  color text default '#5B6B73',
  reserved_until timestamptz,                -- checkout hold; expires on its own
  nft_asset text,                            -- Solana NFT address (Phantom buyers only)
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into plots (slot_index, tier, price_cents, color) values
  (0, 'kiosk',      500,  '#3E5C50'),
  (1, 'shop',       2500, '#C6402F'),
  (2, 'tower',      7500, '#141821'),
  (3, 'shop',       2500, '#7DC383'),
  (4, 'kiosk',      500,  '#B98567'),
  (5, 'tower',      7500, '#C6402F'),
  (6, 'shop',       2500, '#1B1F3B'),
  (7, 'kiosk',      500,  '#2E6E9E')
on conflict (slot_index) do nothing;

alter table plots enable row level security;
drop policy if exists "public read plots" on plots;
create policy "public read plots" on plots for select using (true);
-- No public write policies on purpose: plots are only claimed server-side
-- (service role) after a payment is confirmed.

-- ───────────────────────── sales_log ─────────────────────────
create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid references plots(id),
  owner_name text,
  price_cents int not null,                  -- USD cents
  created_at timestamptz not null default now()
);
alter table sales_log enable row level security;
drop policy if exists "public read sales log" on sales_log;
create policy "public read sales log" on sales_log for select using (true);

-- ───────────────────────── order tables ─────────────────────────
-- One per payment method (PayMongo, PayPal, NOWPayments crypto, Phantom/Solana). All private (RLS on, no policies).
-- status: 'pending' | 'paid' | 'failed' | 'needs_refund' | 'refunded' | ...

create table if not exists paymongo_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,                  -- USD cents
  amount_php_centavos int not null,          -- what PayMongo actually charged
  status text not null default 'pending',
  checkout_session_id text,
  payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table paymongo_orders enable row level security;

create table if not exists paypal_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,
  status text not null default 'pending',
  paypal_order_id text,
  paypal_capture_id text,
  payer_email text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table paypal_orders enable row level security;

create table if not exists crypto_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,
  status text not null default 'pending',
  np_invoice_id text,
  np_payment_id text,
  pay_currency text,
  actually_paid numeric,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table crypto_orders enable row level security;

create table if not exists solana_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,                  -- USD cents
  buyer_wallet text not null,                -- Phantom address that must pay (and gets the NFT)
  reference text not null unique,            -- unique key attached to the payment tx
  lamports bigint not null,                  -- SOL amount locked in at order time
  sol_usd numeric not null,                  -- SOL price used for the quote
  cluster text not null,                     -- 'devnet' | 'mainnet-beta'
  status text not null default 'pending',
  tx_signature text unique,
  nft_status text not null default 'none',   -- 'none' | 'minting' | 'minted' | 'failed'
  nft_asset text,
  nft_error text,
  nft_started_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table solana_orders enable row level security;

-- ───────────────────────── completion functions ─────────────────────────
-- Each one claims the plot + logs the sale in a single transaction.
-- Returns 'ok', or 'plot_taken' (order marked needs_refund) if the plot was
-- sold another way after the buyer's hold ran out.

create or replace function complete_paymongo_order(p_order_id uuid, p_session_id text, p_payment_id text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o paymongo_orders%rowtype; claimed int;
begin
  select * into o from paymongo_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  update plots set status='claimed', owner_name=o.owner_name, website_url=o.website_url,
         logo_url=o.logo_url, claimed_at=now(), reserved_until=null
   where id=o.plot_id and status='available';
  get diagnostics claimed = row_count;
  if claimed = 0 then
    update paymongo_orders set status='needs_refund', checkout_session_id=coalesce(p_session_id, checkout_session_id), payment_id=p_payment_id where id=o.id;
    return 'plot_taken';
  end if;
  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update paymongo_orders set status='paid', checkout_session_id=coalesce(p_session_id, checkout_session_id), payment_id=p_payment_id, paid_at=now() where id=o.id;
  return 'ok';
end $$;

create or replace function complete_paypal_order(p_order_id uuid, p_capture_id text, p_payer_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o paypal_orders%rowtype; claimed int;
begin
  select * into o from paypal_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  update plots set status='claimed', owner_name=o.owner_name, website_url=o.website_url,
         logo_url=o.logo_url, claimed_at=now(), reserved_until=null
   where id=o.plot_id and status='available';
  get diagnostics claimed = row_count;
  if claimed = 0 then
    update paypal_orders set status='needs_refund', paypal_capture_id=p_capture_id, payer_email=p_payer_email where id=o.id;
    return 'plot_taken';
  end if;
  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update paypal_orders set status='paid', paypal_capture_id=p_capture_id, payer_email=p_payer_email, paid_at=now() where id=o.id;
  return 'ok';
end $$;

create or replace function complete_crypto_order(p_order_id uuid, p_payment_id text, p_pay_currency text, p_actually_paid numeric)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o crypto_orders%rowtype; claimed int;
begin
  select * into o from crypto_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  update plots set status='claimed', owner_name=o.owner_name, website_url=o.website_url,
         logo_url=o.logo_url, claimed_at=now(), reserved_until=null
   where id=o.plot_id and status='available';
  get diagnostics claimed = row_count;
  if claimed = 0 then
    update crypto_orders set status='needs_refund', np_payment_id=p_payment_id, pay_currency=p_pay_currency, actually_paid=p_actually_paid where id=o.id;
    return 'plot_taken';
  end if;
  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update crypto_orders set status='paid', np_payment_id=p_payment_id, pay_currency=p_pay_currency, actually_paid=p_actually_paid, paid_at=now() where id=o.id;
  return 'ok';
end $$;

create or replace function complete_solana_order(p_order_id uuid, p_signature text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o solana_orders%rowtype; claimed int;
begin
  select * into o from solana_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  update plots set status='claimed', owner_name=o.owner_name, website_url=o.website_url,
         logo_url=o.logo_url, claimed_at=now(), reserved_until=null
   where id=o.plot_id and status='available';
  get diagnostics claimed = row_count;
  if claimed = 0 then
    update solana_orders set status='needs_refund', tx_signature=p_signature where id=o.id;
    return 'plot_taken';
  end if;
  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update solana_orders set status='paid', tx_signature=p_signature, paid_at=now() where id=o.id;
  return 'ok';
end $$;

-- Only one request at a time may mint an order's NFT. Returns true if this caller won the job.
create or replace function start_solana_nft_mint(p_order_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update solana_orders set nft_status='minting', nft_started_at=now(), nft_error=null
   where id=p_order_id and status='paid'
     and (nft_status in ('none','failed') or (nft_status='minting' and nft_started_at < now() - interval '5 minutes'));
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Only the server (service role) may run these.
revoke execute on function complete_paymongo_order(uuid, text, text) from public, anon, authenticated;
revoke execute on function complete_paypal_order(uuid, text, text) from public, anon, authenticated;
revoke execute on function complete_crypto_order(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function complete_solana_order(uuid, text) from public, anon, authenticated;
revoke execute on function start_solana_nft_mint(uuid) from public, anon, authenticated;

create table if not exists stripe_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,                  -- USD cents, what Stripe charged
  status text not null default 'pending',    -- pending | paid | expired | failed | needs_refund
  checkout_session_id text,
  payment_intent_id text,
  customer_email text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table stripe_orders enable row level security;

create or replace function complete_stripe_order(p_order_id uuid, p_session_id text, p_payment_intent text, p_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o stripe_orders%rowtype; claimed int;
begin
  select * into o from stripe_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  update plots set status='claimed', owner_name=o.owner_name, website_url=o.website_url,
         logo_url=o.logo_url, claimed_at=now(), reserved_until=null
   where id=o.plot_id and status='available';
  get diagnostics claimed = row_count;
  if claimed = 0 then
    update stripe_orders set status='needs_refund', checkout_session_id=coalesce(p_session_id, checkout_session_id), payment_intent_id=p_payment_intent, customer_email=p_email where id=o.id;
    return 'plot_taken';
  end if;
  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update stripe_orders set status='paid', checkout_session_id=coalesce(p_session_id, checkout_session_id), payment_intent_id=p_payment_intent, customer_email=p_email, paid_at=now() where id=o.id;
  return 'ok';
end $$;
revoke execute on function complete_stripe_order(uuid, text, text, text) from public, anon, authenticated;
