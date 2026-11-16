-- Neon Tower: one giant billboard at the top of the avenue. Anyone can take it over;
-- every takeover makes the next one cost $1 more (starts at $5). Every past owner
-- stays forever in the Hall of Fame (tower_history).

create table if not exists tower_state (
  id int primary key default 1 check (id = 1),
  owner_name text,
  website_url text,
  logo_url text,
  message text,
  price_cents int not null default 0,       -- what the current owner paid
  takeovers int not null default 0,         -- how many times it has been taken
  taken_at timestamptz
);
insert into tower_state (id) values (1) on conflict (id) do nothing;
alter table tower_state enable row level security;
drop policy if exists "public read tower" on tower_state;
create policy "public read tower" on tower_state for select using (true);

create table if not exists tower_history (
  id uuid primary key default gen_random_uuid(),
  takeover_no int not null,
  owner_name text not null,
  website_url text not null,
  logo_url text,
  message text,
  price_cents int not null,
  created_at timestamptz not null default now()
);
alter table tower_history enable row level security;
drop policy if exists "public read tower history" on tower_history;
create policy "public read tower history" on tower_history for select using (true);

-- Private: one row per checkout (card via Stripe, or GCash / QR Ph via PayMongo).
create table if not exists tower_orders (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  website_url text not null,
  logo_url text,
  message text,
  price_cents int not null,                 -- USD cents, fixed when checkout starts
  via text not null,                        -- 'card' | 'gcash'
  amount_php_centavos int,                  -- what PayMongo charged (gcash only)
  status text not null default 'pending',   -- pending | paid | expired | failed | needs_refund
  session_id text,
  payment_ref text,
  customer_email text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table tower_orders enable row level security;

-- $5 for the first takeover, then +$1 each time.
create or replace function tower_next_price_cents()
returns int language sql stable security definer set search_path to 'public' as $$
  select 500 + takeovers * 100 from tower_state where id = 1
$$;

-- Put the buyer on the tower + add them to the Hall of Fame, in one step.
-- If two people paid at the same price at the same time, both are honoured, one after the other.
create or replace function complete_tower_order(p_order_id uuid, p_session_id text, p_payment_ref text, p_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare o tower_orders%rowtype; n int;
begin
  select * into o from tower_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return 'ok'; end if;
  perform 1 from tower_state where id = 1 for update;
  update tower_state set owner_name=o.owner_name, website_url=o.website_url, logo_url=o.logo_url,
         message=o.message, price_cents=o.price_cents, takeovers=takeovers+1, taken_at=now()
   where id = 1 returning takeovers into n;
  insert into tower_history (takeover_no, owner_name, website_url, logo_url, message, price_cents)
    values (n, o.owner_name, o.website_url, o.logo_url, o.message, o.price_cents);
  insert into sales_log (plot_id, owner_name, price_cents) values (null, o.owner_name, o.price_cents);
  update tower_orders set status='paid', session_id=coalesce(p_session_id, session_id), payment_ref=p_payment_ref,
         customer_email=p_email, paid_at=now() where id = o.id;
  return 'ok';
end $$;
revoke execute on function complete_tower_order(uuid, text, text, text) from public, anon, authenticated;
