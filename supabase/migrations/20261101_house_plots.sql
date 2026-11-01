-- House plots = Plot Avenue's own projects placed for free: shown lit on the street, not counted as sales.
alter table public.plots add column if not exists house boolean not null default false;
-- Thriving with Autism on shop plot 3 (Nov 2026):
-- update plots set status='claimed', owner_name='Thriving with Autism', website_url='https://fua1g2-u0.myshopify.com',
--   logo_url='https://plot-avenue.vercel.app/house/thriving-with-autism.png', color='#346296', house=true, claimed_at=now()
-- where slot_index=3;
