-- =============================================================
-- Costmatic — Migration 0015: net profit tells the truth about returns
--
-- Two corrections to the reporting figures.
--
-- 1. Returns were being subtracted from profit at their FULL SALE VALUE.
--    That is wrong: the goods came back and went onto the shelf, so their
--    cost is recovered — only the margin is lost. Selling Rs 1,000 of stock
--    that cost Rs 800 earns Rs 200; if it all comes back the day's profit is
--    zero, not minus Rs 800. get_period_returns_margin() gives the figure
--    that should actually be deducted.
--
-- 2. get_period_expenses() ordered its categories by the total cast to TEXT,
--    so Rs 9,000 sorted above Rs 10,000 and the biggest expense was rarely
--    at the top. Ordered numerically now.
-- =============================================================

-- ── Margin lost to returns in a period (admin-only, like profit) ──
-- Mirrors get_period_profit: same cost source (product_costs), same unit
-- conversion, and the same exclusion of voided bills so the two figures are
-- always computed over the same set of sales.
create or replace function public.get_period_returns_margin(
  p_from date, p_to date, p_sale_type text default null)
returns numeric language plpgsql security definer set search_path to 'public'
as $$
declare v_total numeric;
begin
  if current_user_role() <> 'admin' then raise exception 'Access denied'; end if;

  select coalesce(sum(ri.line_total - (coalesce(pc.cost_price,0) * ri.quantity * pu.factor)),0)
  into v_total
  from sale_return_items ri
  join sale_returns r on r.id = ri.return_id
  join sales s on s.id = r.sale_id and not s.is_void
  join product_units pu on pu.product_id = ri.product_id and pu.unit_name = ri.unit_name
  left join product_costs pc on pc.product_id = ri.product_id
  where r.date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type);

  return v_total;
end;
$$;

revoke execute on function public.get_period_returns_margin(date, date, text) from public, anon;
grant  execute on function public.get_period_returns_margin(date, date, text) to authenticated;

-- ── Expense categories, biggest first (numeric, not text) ────
create or replace function public.get_period_expenses(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_total numeric; v_rows jsonb;
begin
  if current_user_role() <> 'admin' then raise exception 'Access denied'; end if;

  select coalesce(sum(amount), 0) into v_total
  from expenses where date between p_from and p_to;

  select coalesce(jsonb_agg(x order by t desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'category',    coalesce(c.name_en, 'Other'),
      'category_ur', coalesce(c.name_ur, ''),
      'total',       sum(e.amount),
      'count',       count(*)) as x,
      sum(e.amount) as t
    from expenses e left join expense_categories c on c.id = e.category_id
    where e.date between p_from and p_to
    group by c.name_en, c.name_ur
  ) s;

  return jsonb_build_object('total', v_total, 'by_category', v_rows);
end;
$$;

revoke execute on function public.get_period_expenses(date, date) from public, anon;
grant  execute on function public.get_period_expenses(date, date) to authenticated;
