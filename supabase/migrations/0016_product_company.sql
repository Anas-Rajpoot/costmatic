-- =============================================================
-- Costmatic — Migration 0016: who makes it, separately from the brand
--
-- products.brand already held things like "Pepsi" or "7up". But a shopkeeper
-- orders by COMPANY, not brand: the PepsiCo man calls once and takes an order
-- covering Pepsi, 7up, Mirinda, Dew and Sting together. Squeezing both into
-- one column meant you could filter by one or the other, never both.
--
--   company  PepsiCo Pakistan      ← who you order from / who delivers
--   brand    7up                   ← what is on the bottle
-- =============================================================

alter table public.products
  add column if not exists company text;

-- Filtering the catalog by company is a per-keystroke operation in the
-- Products screen, so it gets its own index.
create index if not exists products_company_idx on public.products(company);

comment on column public.products.company is
  'Manufacturer / distributor the shop orders from (PepsiCo Pakistan). Distinct from brand (7up).';
