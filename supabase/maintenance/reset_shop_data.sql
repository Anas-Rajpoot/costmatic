-- =============================================================
-- Costmatic — full shop reset (DESTRUCTIVE, one-way)
--
-- Wipes the trading history and the old catalog so the shop can start clean,
-- and KEEPS the seeded beverage catalog, categories, settings and users.
--
--   GONE      every sale, sale line, return, khata entry, purchase, supplier
--             ledger entry, stock adjustment, expense and day close;
--             every ACTIVE product; every customer and supplier
--   KEPT      the 166 inactive beverages, categories, settings, users
--
-- This cannot be run from the app. sales, sale_items and customer_ledger have
-- no DELETE policy — migration 0002 locked them so nothing but the RPCs can
-- write there — so a client-side delete silently affects zero rows. Run this
-- in the Supabase SQL editor, which bypasses RLS.
--
--   Supabase dashboard → SQL Editor → paste → Run
--
-- There is no undo. Take a backup first if there is any doubt:
--   Dashboard → Database → Backups
-- =============================================================

begin;

-- ── 1. Trading history, children before parents ─────────────
delete from public.sale_return_items;
delete from public.sale_returns;
delete from public.sale_items;
delete from public.customer_ledger;
delete from public.sales;

delete from public.purchase_items;
delete from public.supplier_ledger;
delete from public.purchases;

-- These arrive with migrations 0012–0014; skip quietly if not applied yet.
do $$
begin
  if to_regclass('public.stock_adjustments') is not null then
    delete from public.stock_adjustments;
  end if;
  if to_regclass('public.expenses') is not null then
    delete from public.expenses;
  end if;
  if to_regclass('public.day_closes') is not null then
    delete from public.day_closes;
  end if;
end $$;

-- ── 2. The old catalog ──────────────────────────────────────
-- Only the active ones. The seeded beverages are inactive and stay put.
-- product_units, stock and product_costs cascade with the product.
delete from public.products where is_active = true;

-- ── 3. Contacts ─────────────────────────────────────────────
-- Safe now: the sales and ledger rows that referenced them are gone.
delete from public.customers;
delete from public.suppliers;

-- ── 4. Nothing on the shelf yet ─────────────────────────────
update public.stock set quantity_in_base_unit = 0, updated_at = now();

-- ── 5. Start the numbering over ─────────────────────────────
-- Otherwise the first fresh bill would be INV-2026-0041 and read like the
-- history is still there.
alter sequence public.sale_invoice_seq restart with 1;
do $$
begin
  if to_regclass('public.sale_return_seq') is not null then
    alter sequence public.sale_return_seq restart with 1;
  end if;
end $$;

-- ── 6. What is left ─────────────────────────────────────────
do $$
declare v_p int; v_a int; v_s int; v_c int;
begin
  select count(*) into v_p from products;
  select count(*) into v_a from products where is_active;
  select count(*) into v_s from sales;
  select count(*) into v_c from customers;
  raise notice 'Reset done — products: % (active %), sales: %, customers: %', v_p, v_a, v_s, v_c;
end $$;

commit;
