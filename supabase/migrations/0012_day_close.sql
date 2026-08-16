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
