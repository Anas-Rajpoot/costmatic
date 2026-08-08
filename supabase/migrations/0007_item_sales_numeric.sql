-- =============================================================
-- Costmatic — Migration 0007: item-sales report keeps fractional qty
--
-- After 0006, sale_items.quantity is numeric(12,3). get_item_sales summed it as
-- ::bigint, which truncated loose weights (0.8 + 0.35 kg → 1 kg) at the DB level
-- before the client ever saw them. Return numeric so loose totals stay exact.
-- =============================================================

drop function if exists public.get_item_sales(date, date, text);

create or replace function public.get_item_sales(p_from date, p_to date, p_sale_type text default null)
returns table(product_name text, unit_name text, total_qty numeric, revenue numeric)
language sql security definer set search_path to 'public'
as $$
  select p.name_en as product_name, si.unit_name,
         sum(si.quantity) as total_qty, sum(si.line_total) as revenue
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  where s.date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type)
  group by p.name_en, si.unit_name order by revenue desc limit 100
$$;

revoke execute on function public.get_item_sales(date, date, text) from public, anon;
grant  execute on function public.get_item_sales(date, date, text) to authenticated;
