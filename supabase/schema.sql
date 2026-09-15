-- Plot Avenue schema
-- Run this in the Supabase SQL editor for a new project.

create table if not exists plots (
  id uuid primary key default gen_random_uuid(),
  slot_index int not null unique,        -- fixed position in the skyline, 0-based left to right
  tier text not null,                    -- 'kiosk' | 'shop' | 'tower' | 'skyscraper'
  price_cents int not null,              -- amount charged for this tier
  status text not null default 'available', -- 'available' | 'pending' | 'claimed'
  owner_name text,
  website_url text,
  logo_url text,
  color text default '#5B6B73',          -- building color, buyer can't change on MVP (fixed per tier)
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seed 10 slots across four tiers, mirroring a small skyline.
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

-- Row Level Security: anyone can read plots (public skyline view).
alter table plots enable row level security;

create policy "public read plots"
  on plots for select
  using (true);

-- Only the service role (server-side, after payment confirms) can write.
-- No public insert/update policy is defined on purpose — claims must go
-- through the API route using the Supabase service key.

-- Simple sales log, mirrors the "activity feed" on the reference site.
create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid references plots(id),
  owner_name text,
  price_cents int not null,
  created_at timestamptz not null default now()
);

alter table sales_log enable row level security;

create policy "public read sales log"
  on sales_log for select
  using (true);
