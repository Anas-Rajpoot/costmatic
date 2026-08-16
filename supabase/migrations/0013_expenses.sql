-- =============================================================
-- Costmatic — Migration 0013: expenses (kharcha)
--
-- Without expenses the "profit" figure is only gross margin: bijli, kiraya,
-- transport and chai never reach the books, and the drawer never tallies at
-- closing time. This adds a simple expense book:
--
--   • expense_categories — a short, editable list (seeded for a kiryana shop)
--   • expenses           — one row per payment, cash or bank
--
-- Cash expenses flow into the day close (money leaves the drawer) and into the
-- period profit, so both figures finally reflect reality.
-- =============================================================

create table if not exists public.expense_categories (
  id        uuid primary key default gen_random_uuid(),
  name_en   text not null,
  name_ur   text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 100
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  date        date not null default current_date,
  category_id uuid references public.expense_categories(id) on delete set null,
  amount      numeric(12,2) not null check (amount > 0),
  -- Cash leaves the drawer; bank/online does not, but both hit profit.
  is_cash     boolean not null default true,
  note        text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists expenses_date_idx     on public.expenses(date desc);
create index if not exists expenses_category_idx on public.expenses(category_id);

alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;

-- Categories: everyone reads, admin maintains.
drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select
  using (auth.uid() is not null);

drop policy if exists expense_categories_write_admin on public.expense_categories;
create policy expense_categories_write_admin on public.expense_categories for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- Expenses: staff can record what they pay out (their own row, own name), and
-- admins can correct or remove anything.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select
  using (auth.uid() is not null);

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists expenses_update_admin on public.expenses;
create policy expenses_update_admin on public.expenses for update
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

drop policy if exists expenses_delete_admin on public.expenses;
create policy expenses_delete_admin on public.expenses for delete
  using (current_user_role() = 'admin');

-- Seed the categories a Pakistani kiryana actually uses (idempotent).
insert into public.expense_categories (name_en, name_ur, sort_order)
select v.name_en, v.name_ur, v.sort_order
from (values
  ('Rent',            'کرایہ',            10),
  ('Electricity',     'بجلی',             20),
  ('Gas / Water',     'گیس / پانی',       30),
  ('Salary / Wages',  'تنخواہ',           40),
  ('Transport',       'ٹرانسپورٹ',        50),
  ('Tea / Food',      'چائے / کھانا',     60),
  ('Repairs',         'مرمت',             70),
  ('Packing / Bags',  'پیکنگ / شاپر',     80),
  ('Charity',         'خیرات',            90),
  ('Other',           'متفرق',           100)
) as v(name_en, name_ur, sort_order)
where not exists (select 1 from public.expense_categories c where c.name_en = v.name_en);

-- ── Day close: cash expenses leave the drawer ───────────────
alter table public.day_closes
  add column if not exists expenses_cash numeric(12,2) not null default 0;

create or replace function public.get_day_summary(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_opening  numeric;
  v_sales    numeric;
  v_khata    numeric;
  v_returns  numeric;
  v_supplier numeric;
  v_purch    numeric;
  v_exp      numeric;
  v_close    record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select counted_cash into v_opening
  from day_closes where date < p_date order by date desc limit 1;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(paid), 0) into v_sales
  from sales where date = p_date and not is_void;

  select coalesce(sum(-amount), 0) into v_khata
  from customer_ledger where date = p_date and type = 'payment';

  select coalesce(sum(total), 0) into v_returns
  from sale_returns where date = p_date and refund_mode = 'cash';

  select coalesce(sum(-amount), 0) into v_supplier
  from supplier_ledger where date = p_date and type = 'payment';

  select coalesce(sum(paid), 0) into v_purch
  from purchases where date = p_date;

  select coalesce(sum(amount), 0) into v_exp
  from expenses where date = p_date and is_cash;

  select * into v_close from day_closes where date = p_date;

  return jsonb_build_object(
    'date',            p_date,
    'opening_cash',    v_opening,
    'cash_sales',      v_sales,
    'khata_collected', v_khata,
    'returns_cash',    v_returns,
    'supplier_paid',   v_supplier,
    'purchases_cash',  v_purch,
    'expenses_cash',   v_exp,
    'expected_cash',   v_opening + v_sales + v_khata - v_returns - v_supplier - v_purch - v_exp,
    'invoices',        (select count(*) from sales where date = p_date and not is_void),
    'returns_count',   (select count(*) from sale_returns where date = p_date),
    'sales_total',     (select coalesce(sum(total),0) from sales where date = p_date and not is_void),
    'udhaar_given',    (select coalesce(sum(due),0) from sales where date = p_date and not is_void),
    'closed',          v_close.id is not null,
    'counted_cash',    v_close.counted_cash,
    'difference',      v_close.difference,
    'closed_at',       v_close.closed_at,
    'note',            v_close.note);
end;
$$;

revoke execute on function public.get_day_summary(date) from public, anon;
grant  execute on function public.get_day_summary(date) to authenticated;

create or replace function public.close_day(
  p_date date, p_counted numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_s     jsonb;
  v_count numeric := round(greatest(coalesce(p_counted, 0), 0), 2);
  v_exp   numeric;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_date > current_date then raise exception 'Cannot close a day that has not happened yet'; end if;

  v_s   := get_day_summary(p_date);
  v_exp := (v_s->>'expected_cash')::numeric;

  insert into day_closes (date, opening_cash, cash_sales, khata_collected, returns_cash,
                          supplier_paid, purchases_cash, expenses_cash, expected_cash,
                          counted_cash, difference, note, closed_by, closed_at)
  values (p_date,
          (v_s->>'opening_cash')::numeric,
          (v_s->>'cash_sales')::numeric,
          (v_s->>'khata_collected')::numeric,
          (v_s->>'returns_cash')::numeric,
          (v_s->>'supplier_paid')::numeric,
          (v_s->>'purchases_cash')::numeric,
          (v_s->>'expenses_cash')::numeric,
          v_exp, v_count, v_count - v_exp, p_note, v_uid, now())
  on conflict (date) do update set
    opening_cash    = excluded.opening_cash,
    cash_sales      = excluded.cash_sales,
    khata_collected = excluded.khata_collected,
    returns_cash    = excluded.returns_cash,
    supplier_paid   = excluded.supplier_paid,
    purchases_cash  = excluded.purchases_cash,
    expenses_cash   = excluded.expenses_cash,
    expected_cash   = excluded.expected_cash,
    counted_cash    = excluded.counted_cash,
    difference      = excluded.difference,
    note            = excluded.note,
    closed_by       = excluded.closed_by,
    closed_at       = now();

  return get_day_summary(p_date);
end;
$$;

revoke execute on function public.close_day(date, numeric, text) from public, anon;
grant  execute on function public.close_day(date, numeric, text) to authenticated;

-- ── Period expense totals (admin-only, like profit) ─────────
create or replace function public.get_period_expenses(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_total numeric; v_rows jsonb;
begin
  if current_user_role() <> 'admin' then raise exception 'Access denied'; end if;
  select coalesce(sum(amount), 0) into v_total
  from expenses where date between p_from and p_to;
  select coalesce(jsonb_agg(x order by x->>'total' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'category', coalesce(c.name_en, 'Other'),
      'category_ur', coalesce(c.name_ur, ''),
      'total', sum(e.amount),
      'count', count(*)) as x
    from expenses e left join expense_categories c on c.id = e.category_id
    where e.date between p_from and p_to
    group by c.name_en, c.name_ur
  ) s;
  return jsonb_build_object('total', v_total, 'by_category', v_rows);
end;
$$;

revoke execute on function public.get_period_expenses(date, date) from public, anon;
grant  execute on function public.get_period_expenses(date, date) to authenticated;

-- ── Dashboard: today's expenses + net of returns/expenses ───
create or replace function public.get_dashboard_stats(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_today_total numeric; v_today_cash numeric; v_today_udhaar numeric;
  v_today_invoices bigint; v_receivable numeric; v_payable numeric; v_low_stock bigint;
  v_today_returns numeric; v_today_expenses numeric;
  v_is_admin boolean := current_user_role() = 'admin';
begin
  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0), count(*)
  into v_today_total, v_today_cash, v_today_udhaar, v_today_invoices
  from sales where date = p_date and not is_void;
  select coalesce(sum(total),0) into v_today_returns from sale_returns where date = p_date;
  select coalesce(sum(greatest(current_balance,0)),0) into v_receivable from customers;
  if v_is_admin then
    select coalesce(sum(greatest(current_balance,0)),0) into v_payable from suppliers;
    select coalesce(sum(amount),0) into v_today_expenses from expenses where date = p_date;
  else
    v_payable := null;
    v_today_expenses := null;
  end if;
  select count(*) into v_low_stock from products p join stock s on s.product_id = p.id
  where p.is_active and s.quantity_in_base_unit <= p.min_stock_level;
  return jsonb_build_object(
    'today_total', v_today_total, 'today_cash', v_today_cash, 'today_udhaar', v_today_udhaar,
    'today_invoices', v_today_invoices, 'total_receivable', v_receivable,
    'total_payable', v_payable, 'low_stock_count', v_low_stock,
    'today_returns', v_today_returns,
    'today_expenses', v_today_expenses,
    'today_net', v_today_total - v_today_returns);
end;
$$;

revoke execute on function public.get_dashboard_stats(date) from public, anon;
grant  execute on function public.get_dashboard_stats(date) to authenticated;
