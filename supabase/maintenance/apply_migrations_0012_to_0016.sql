-- =============================================================
-- Costmatic — Migration 0012: day close (golak / cash-up)
--
-- At closing time the shopkeeper needs one number: what SHOULD be in the
-- drawer, against what is actually there.
--
--   opening float
--   + cash taken against bills          (sales.paid)
--   + khata recovered                   (customer_ledger payments)
--   − cash refunded on returns          (sale_returns, refund_mode = 'cash')
--   − cash paid to suppliers            (supplier_ledger payments)
--   − cash paid at purchase time        (purchases.paid)
--   = expected in drawer
--
-- Both figures are recomputed server-side when the day is closed, so the saved
-- record can't disagree with the ledgers. The difference (over/short) is stored
-- rather than hidden — that is the whole point of the exercise.
-- =============================================================

create table if not exists public.day_closes (
  id               uuid primary key default gen_random_uuid(),
  date             date not null unique,
  opening_cash     numeric(12,2) not null default 0,
  cash_sales       numeric(12,2) not null default 0,
  khata_collected  numeric(12,2) not null default 0,
  returns_cash     numeric(12,2) not null default 0,
  supplier_paid    numeric(12,2) not null default 0,
  purchases_cash   numeric(12,2) not null default 0,
  expected_cash    numeric(12,2) not null default 0,
  counted_cash     numeric(12,2) not null default 0,
  difference       numeric(12,2) not null default 0,  -- counted − expected
  note             text,
  closed_by        uuid references public.users(id) on delete set null,
  closed_at        timestamptz not null default now()
);

create index if not exists day_closes_date_idx on public.day_closes(date desc);

alter table public.day_closes enable row level security;

drop policy if exists day_closes_select on public.day_closes;
create policy day_closes_select on public.day_closes for select
  using (auth.uid() is not null);

-- Written only through close_day(); a mistaken close is an admin correction.
drop policy if exists day_closes_delete_admin on public.day_closes;
create policy day_closes_delete_admin on public.day_closes for delete
  using (current_user_role() = 'admin');

-- ── The day's cash movement, computed from the ledgers ──────
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
  v_close    record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Opening float = what was counted at the last close before this day.
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

  select * into v_close from day_closes where date = p_date;

  return jsonb_build_object(
    'date',            p_date,
    'opening_cash',    v_opening,
    'cash_sales',      v_sales,
    'khata_collected', v_khata,
    'returns_cash',    v_returns,
    'supplier_paid',   v_supplier,
    'purchases_cash',  v_purch,
    'expected_cash',   v_opening + v_sales + v_khata - v_returns - v_supplier - v_purch,
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

-- ── Close the day ───────────────────────────────────────────
-- Every figure except the counted cash is recomputed here; the client only
-- reports what the drawer actually holds.
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
                          supplier_paid, purchases_cash, expected_cash, counted_cash,
                          difference, note, closed_by, closed_at)
  values (p_date,
          (v_s->>'opening_cash')::numeric,
          (v_s->>'cash_sales')::numeric,
          (v_s->>'khata_collected')::numeric,
          (v_s->>'returns_cash')::numeric,
          (v_s->>'supplier_paid')::numeric,
          (v_s->>'purchases_cash')::numeric,
          v_exp, v_count, v_count - v_exp, p_note, v_uid, now())
  on conflict (date) do update set
    opening_cash    = excluded.opening_cash,
    cash_sales      = excluded.cash_sales,
    khata_collected = excluded.khata_collected,
    returns_cash    = excluded.returns_cash,
    supplier_paid   = excluded.supplier_paid,
    purchases_cash  = excluded.purchases_cash,
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
-- =============================================================
-- Costmatic — Migration 0014: stock adjustments (wastage / expiry / count)
--
-- Stock only ever moved through sales, returns and purchases, so an expired
-- pack, a broken bottle or a physical count that disagrees with the system had
-- nowhere to go — the shelf and the screen drifted apart with no way back.
--
-- adjust_stock() is the single, audited way to move stock outside a trade:
--   mode 'remove'  — wastage, expiry, damage, theft (stock goes down)
--   mode 'add'     — found stock / correction (stock goes up)
--   mode 'set'     — a physical count; the difference is computed and recorded
--
-- Admin-only, like every other stock write, and every adjustment keeps the
-- before/after figures so the history explains itself later.
-- =============================================================

create table if not exists public.stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete restrict,
  date        date not null default current_date,
  -- All quantities are in the product's base unit, like the stock table.
  before_qty  numeric(12,3) not null,
  delta       numeric(12,3) not null,
  after_qty   numeric(12,3) not null,
  reason      text not null check (reason in
    ('wastage','expiry','damage','theft','count','correction','other')),
  note        text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists stock_adj_product_idx on public.stock_adjustments(product_id);
create index if not exists stock_adj_date_idx    on public.stock_adjustments(date desc);

alter table public.stock_adjustments enable row level security;

-- Readable by staff (so the POS can explain a stock change), written only by
-- the RPC below, deletable by nobody — an adjustment is a record, not a draft.
drop policy if exists stock_adj_select on public.stock_adjustments;
create policy stock_adj_select on public.stock_adjustments for select
  using (auth.uid() is not null);

create or replace function public.adjust_stock(
  p_product_id uuid, p_mode text, p_quantity numeric,
  p_reason text, p_note text default null, p_date date default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date := coalesce(p_date, current_date);
  v_kind   text;
  v_name   text;
  v_before numeric;
  v_delta  numeric;
  v_after  numeric;
  v_qty    numeric := coalesce(p_quantity, 0);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from users where id = v_uid and role = 'admin') then
    raise exception 'Access denied';
  end if;
  if p_reason not in ('wastage','expiry','damage','theft','count','correction','other') then
    raise exception 'Unknown reason %', p_reason;
  end if;
  if v_date > current_date then raise exception 'Cannot adjust stock in the future'; end if;

  select p.name_en, p.product_kind, coalesce(s.quantity_in_base_unit, 0)
    into v_name, v_kind, v_before
  from products p left join stock s on s.product_id = p.id
  where p.id = p_product_id;
  if not found then raise exception 'Product not found'; end if;

  -- Counted items move in whole base units; loose items may move by weight.
  if coalesce(v_kind,'standard') = 'standard' and v_qty <> trunc(v_qty) then
    raise exception 'Whole quantity required for % (counted item)', v_name;
  end if;

  if p_mode = 'set' then
    if v_qty < 0 then raise exception 'A counted quantity cannot be negative'; end if;
    v_after := v_qty;
    v_delta := v_after - v_before;
  elsif p_mode = 'add' then
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    v_delta := v_qty;
    v_after := v_before + v_delta;
  elsif p_mode = 'remove' then
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_qty > v_before then
      raise exception 'Cannot remove % — only % in stock', v_qty, v_before;
    end if;
    v_delta := -v_qty;
    v_after := v_before + v_delta;
  else
    raise exception 'Unknown mode %', p_mode;
  end if;

  if v_delta = 0 then raise exception 'Nothing to adjust — the count already matches'; end if;

  insert into stock (product_id, quantity_in_base_unit, updated_at)
  values (p_product_id, v_after, now())
  on conflict (product_id) do update set
    quantity_in_base_unit = excluded.quantity_in_base_unit, updated_at = now();

  insert into stock_adjustments (product_id, date, before_qty, delta, after_qty, reason, note, created_by)
  values (p_product_id, v_date, v_before, v_delta, v_after, p_reason, p_note, v_uid);

  return jsonb_build_object('product', v_name, 'before', v_before, 'delta', v_delta, 'after', v_after);
end;
$$;

revoke execute on function public.adjust_stock(uuid, text, numeric, text, text, date) from public, anon;
grant  execute on function public.adjust_stock(uuid, text, numeric, text, text, date) to authenticated;
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
