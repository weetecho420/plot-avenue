-- Parent Street: a section under the avenue showing parenting products as shop cards.
-- Henry's own products sit here first; open cards invite other parenting sellers to claim a plot.
-- Add / hide a product by inserting a row or setting active=false (no code change needed).
create table if not exists street_products (
  id uuid primary key default gen_random_uuid(),
  street text not null default 'parent',
  title text not null,
  blurb text,
  price_cents int,                         -- USD cents; null = don't show a price
  url text not null,                       -- where "Get it" goes
  image_url text,
  sort int not null default 0,
  active boolean not null default true,
  clicks int not null default 0,           -- real clicks, counted by /go/<id>
  created_at timestamptz not null default now()
);

alter table street_products enable row level security;
drop policy if exists "public read street products" on street_products;
create policy "public read street products" on street_products for select using (active);

-- Count a click and return where to send the visitor. Server only.
create or replace function bump_street_click(p_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare dest text;
begin
  update street_products set clicks = clicks + 1 where id = p_id and active returning url into dest;
  return dest;
end $$;
revoke execute on function bump_street_click(uuid) from public, anon, authenticated;

insert into street_products (street, title, blurb, price_cents, url, image_url, sort)
select 'parent',
  'Thriving with Autism Level 2',
  'The complete parent''s guide for a calmer, more regulated home.',
  1499,
  'https://fua1g2-u0.myshopify.com/products/thriving-with-autism-level-2-the-complete-parents-guide?utm_source=plotavenue&utm_medium=parent_street',
  'https://cdn.shopify.com/s/files/1/0806/4925/7098/files/level2Thrivingautism-product-cover.png?v=1792812015',
  0
where not exists (select 1 from street_products where title = 'Thriving with Autism Level 2');
