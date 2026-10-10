-- Plot Avenue schema
-- Run this in the Supabase SQL editor (safe to re-run).
-- Table names are unique to Plot Avenue (plots, sales_log, paypal_orders,
-- crypto_orders), so it can share a Supabase project with other apps.

-- ---------------------------------------------------------------
-- Plots (the skyline)
-- ---------------------------------------------------------------
create table if not exists plots (
  id uuid primary key default gen_random_uuid(),
  slot_index int not null unique,           -- fixed position in the skyline, 0-based left to right
  tier text not null,                       -- 'kiosk' | 'shop' | 'tower' | 'skyscraper'
  price_cents int not null,                 -- USD cents charged for this tier
  status text not null default 'available', -- 'available' | 'pending' | 'claimed'
  owner_name text,
  website_url text,
  logo_url text,
  color text default '#5B6B73',
  reserved_until timestamptz,               -- hold while a PayPal/crypto buyer is paying
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table plots add column if not exists reserved_until timestamptz;

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
-- No public write policy: claims go through API routes with the service key.

-- ---------------------------------------------------------------
-- Sales feed
-- ---------------------------------------------------------------
create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid references plots(id),
  owner_name text,
  price_cents int not null,
  created_at timestamptz not null default now()
);

alter table sales_log enable row level security;
drop policy if exists "public read sales log" on sales_log;
create policy "public read sales log" on sales_log for select using (true);

-- ---------------------------------------------------------------
-- PayPal orders (server-only, no public policies)
-- ---------------------------------------------------------------
create table if not exists paypal_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,
  status text not null default 'pending',
  -- pending | paid | failed | cancelled | needs_refund | pending_review | refunded
  paypal_order_id text unique,
  paypal_capture_id text,
  payer_email text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table paypal_orders enable row level security;

-- ---------------------------------------------------------------
-- Crypto orders via NOWPayments (server-only, no public policies)
-- ---------------------------------------------------------------
create table if not exists crypto_orders (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  price_cents int not null,
  status text not null default 'pending',
  -- pending | paid | failed | expired | partially_paid | needs_refund
  np_invoice_id text,
  np_payment_id text,
  pay_currency text,
  actually_paid numeric,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table crypto_orders enable row level security;

create index if not exists plots_tier_status_idx on plots (tier, status, slot_index);
create index if not exists sales_log_plot_idx on sales_log (plot_id);
create index if not exists paypal_orders_plot_idx on paypal_orders (plot_id);
create index if not exists crypto_orders_plot_idx on crypto_orders (plot_id);

-- ---------------------------------------------------------------
-- Finish a paid order in one step: claim the plot + log the sale.
-- Returns 'ok' or 'plot_taken' (someone else got it; buyer must be refunded).
-- ---------------------------------------------------------------
create or replace function complete_paypal_order(
  p_order_id uuid, p_capture_id text, p_payer_email text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  o paypal_orders%rowtype;
  claimed int;
begin
  select * into o from paypal_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;

  update plots
     set status = 'claimed', owner_name = o.owner_name, website_url = o.website_url,
         logo_url = o.logo_url, claimed_at = now(), reserved_until = null
   where id = o.plot_id and status = 'available';
  get diagnostics claimed = row_count;

  if claimed = 0 then
    update paypal_orders
       set status = 'needs_refund', paypal_capture_id = p_capture_id, payer_email = p_payer_email
     where id = o.id;
    return 'plot_taken';
  end if;

  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update paypal_orders
     set status = 'paid', paypal_capture_id = p_capture_id, payer_email = p_payer_email, paid_at = now()
   where id = o.id;
  return 'ok';
end $$;

create or replace function complete_crypto_order(
  p_order_id uuid, p_payment_id text, p_pay_currency text, p_actually_paid numeric
) returns text
language plpgsql security definer set search_path = public as $$
declare
  o crypto_orders%rowtype;
  claimed int;
begin
  select * into o from crypto_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;

  update plots
     set status = 'claimed', owner_name = o.owner_name, website_url = o.website_url,
         logo_url = o.logo_url, claimed_at = now(), reserved_until = null
   where id = o.plot_id and status = 'available';
  get diagnostics claimed = row_count;

  if claimed = 0 then
    update crypto_orders
       set status = 'needs_refund', np_payment_id = p_payment_id,
           pay_currency = p_pay_currency, actually_paid = p_actually_paid
     where id = o.id;
    return 'plot_taken';
  end if;

  insert into sales_log (plot_id, owner_name, price_cents) values (o.plot_id, o.owner_name, o.price_cents);
  update crypto_orders
     set status = 'paid', np_payment_id = p_payment_id, pay_currency = p_pay_currency,
         actually_paid = p_actually_paid, paid_at = now()
   where id = o.id;
  return 'ok';
end $$;

-- Only the server (service role) may run these.
revoke all on function complete_paypal_order(uuid, text, text) from public, anon, authenticated;
revoke all on function complete_crypto_order(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function complete_paypal_order(uuid, text, text) to service_role;
grant execute on function complete_crypto_order(uuid, text, text, numeric) to service_role;
