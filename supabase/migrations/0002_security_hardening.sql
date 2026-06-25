-- =============================================================
-- Costmatic — Migration 0002: Security hardening
-- Closes the gaps found in the 2026-06-25 review:
--  1. Employees could read cost_price / profit via the API
--  2. Discount cap was not enforced server-side
--  3. Open "WITH CHECK (true)" INSERT policies bypassed the RPCs
--  4. RPCs trusted client-supplied created_by (spoofing)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Move cost_price into an admin-only table
--    (Postgres RLS cannot hide a single column; admin and employee
--     share the `authenticated` role, so the only server-enforced
--     way to hide cost is to isolate it in its own RLS-guarded table.)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;

drop policy if exists product_costs_admin on public.product_costs;
create policy product_costs_admin on public.product_costs for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- Carry over any existing costs, then drop the leaky column
insert into public.product_costs (product_id, cost_price)
  select id, cost_price from public.products
  on conflict (product_id) do nothing;

alter table public.products drop column if exists cost_price;

-- ─────────────────────────────────────────────────────────────
-- 2. Profit RPC: read cost from product_costs + admin-only guard
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_period_profit(p_from date, p_to date)
returns numeric language plpgsql security definer set search_path to 'public'
as $$
declare v_total numeric;
begin
  if current_user_role() <> 'admin' then
    raise exception 'Access denied';
  end if;
  select coalesce(sum(si.line_total - (coalesce(pc.cost_price,0) * si.quantity * pu.factor)),0)
  into v_total
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  join product_units pu on pu.product_id = si.product_id and pu.unit_name = si.unit_name
  left join product_costs pc on pc.product_id = si.product_id
  where s.date between p_from and p_to;
  return v_total;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Dashboard: hide payables (supplier balances) from employees
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_dashboard_stats(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_today_total numeric; v_today_cash numeric; v_today_udhaar numeric;
  v_today_invoices bigint; v_receivable numeric; v_payable numeric; v_low_stock bigint;
  v_is_admin boolean := current_user_role() = 'admin';
begin
  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0), count(*)
  into v_today_total, v_today_cash, v_today_udhaar, v_today_invoices
  from sales where date = p_date and not is_void;
  select coalesce(sum(greatest(current_balance,0)),0) into v_receivable from customers;
  if v_is_admin then
    select coalesce(sum(greatest(current_balance,0)),0) into v_payable from suppliers;
  else
    v_payable := null;
  end if;
  select count(*) into v_low_stock from products p join stock s on s.product_id = p.id
  where p.is_active and s.quantity_in_base_unit <= p.min_stock_level;
  return jsonb_build_object(
    'today_total', v_today_total, 'today_cash', v_today_cash, 'today_udhaar', v_today_udhaar,
    'today_invoices', v_today_invoices, 'total_receivable', v_receivable,
    'total_payable', v_payable, 'low_stock_count', v_low_stock);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. create_sale: authoritative server-side money + discount cap.
--    The server recomputes every price/total from the catalog and
--    the caller's discount_limit; client-supplied money fields are
--    ignored. created_by is taken from auth.uid().
-- ─────────────────────────────────────────────────────────────
drop function if exists public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb);

create or replace function public.create_sale(
  p_customer_id uuid, p_date date, p_subtotal numeric, p_discount numeric, p_tax numeric,
  p_total numeric, p_paid numeric, p_due numeric, p_payment_type text, p_created_by uuid,
  p_items jsonb, p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_limit      numeric;
  v_is_retail  boolean;
  v_sale_id    uuid;
  v_invoice_no text;
  v_item       jsonb;
  v_factor     int;
  v_stock_qty  int;
  v_prod_name  text;
  v_disc       numeric;
  v_list       numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal   numeric := 0;
  v_total      numeric;
  v_paid       numeric;
  v_due        numeric;
  v_hdr_disc   numeric := coalesce(p_discount, 0);
  v_tax        numeric := coalesce(p_tax, 0);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Idempotency for offline replays
  if p_client_id is not null then
    select id, invoice_no into v_sale_id, v_invoice_no from sales where client_id = p_client_id;
    if found then return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no); end if;
  end if;

  -- Caller's discount ceiling
  select case when role = 'admin' then 100 else discount_limit end
    into v_limit from users where id = v_uid;
  if v_limit is null then raise exception 'Access denied'; end if;

  v_is_retail := exists (select 1 from customers where id = p_customer_id and customer_type = 'retail');

  -- Insert sale header (totals filled in after recompute)
  v_invoice_no := 'INV-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_invoice_seq')::text,4,'0');
  insert into sales (invoice_no, customer_id, date, subtotal, discount, tax, total, paid, due, payment_type, created_by, client_id)
  values (v_invoice_no, p_customer_id, p_date, 0, v_hdr_disc, v_tax, 0, 0, 0, p_payment_type, v_uid, p_client_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Catalog lookup: unit price + factor (never trust client prices)
    select pu.factor, case when v_is_retail then pu.retail_price else pu.wholesale_price end
      into v_factor, v_list
    from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then
      raise exception 'Unknown unit % for product %', v_item->>'unit_name', v_item->>'product_id';
    end if;

    -- Enforce discount cap
    v_disc := coalesce((v_item->>'discount_pct')::numeric, 0);
    if v_disc < 0 then v_disc := 0; end if;
    if v_disc > v_limit then
      raise exception 'Discount % %% exceeds your limit of % %%', v_disc, v_limit;
    end if;

    v_unit_price := round(v_list * (1 - v_disc/100), 2);
    v_line_total := round(v_list * (1 - v_disc/100) * (v_item->>'quantity')::int, 2);
    v_subtotal   := v_subtotal + v_line_total;

    -- Stock check + deduction (in base units)
    select s.quantity_in_base_unit, p.name_en into v_stock_qty, v_prod_name
    from stock s join products p on p.id = s.product_id where s.product_id = (v_item->>'product_id')::uuid;
    if coalesce(v_stock_qty,0) < (v_item->>'quantity')::int * v_factor then
      raise exception 'Insufficient stock: % (need %, have %)', v_prod_name,
        (v_item->>'quantity')::int * v_factor, coalesce(v_stock_qty,0);
    end if;

    insert into sale_items (sale_id, product_id, unit_name, quantity, unit_price, discount_pct, line_total)
    values (v_sale_id, (v_item->>'product_id')::uuid, v_item->>'unit_name',
            (v_item->>'quantity')::int, v_unit_price, v_disc, v_line_total);

    update stock set quantity_in_base_unit = quantity_in_base_unit - ((v_item->>'quantity')::int * v_factor),
      updated_at = now() where product_id = (v_item->>'product_id')::uuid;
  end loop;

  -- Authoritative totals
  v_total := round(v_subtotal - v_hdr_disc + v_tax, 2);
  if v_total < 0 then v_total := 0; end if;
  v_paid  := least(greatest(coalesce(p_paid, 0), 0), v_total);
  -- Credit sales must have a customer
  if v_paid < v_total and p_customer_id is null then
    raise exception 'Udhaar (credit) sale requires a customer';
  end if;
  v_due := v_total - v_paid;

  update sales set subtotal = v_subtotal, total = v_total, paid = v_paid, due = v_due where id = v_sale_id;

  if v_due > 0 and p_customer_id is not null then
    insert into customer_ledger (customer_id, type, amount, ref_sale_id, date, created_by)
    values (p_customer_id, 'sale', v_due, v_sale_id, p_date, v_uid);
    update customers set current_balance = current_balance + v_due where id = p_customer_id;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Payments / purchases: stamp created_by from auth.uid()
-- ─────────────────────────────────────────────────────────────
create or replace function public.pay_customer(
  p_customer_id uuid, p_amount numeric, p_date date, p_note text, p_created_by uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  insert into customer_ledger (customer_id, type, amount, date, note, created_by)
  values (p_customer_id, 'payment', -p_amount, p_date, p_note, v_uid);
  update customers set current_balance = current_balance - p_amount where id = p_customer_id;
end;
$$;

create or replace function public.pay_supplier(
  p_supplier_id uuid, p_amount numeric, p_method text, p_date date, p_note text, p_created_by uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_note text;
begin
  if not exists (select 1 from users where id = v_uid and role = 'admin') then
    raise exception 'Access denied';
  end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  v_note := coalesce(p_method,'') || case when coalesce(p_note,'') != '' then ' — ' || p_note else '' end;
  insert into supplier_ledger (supplier_id, type, amount, date, note, created_by)
  values (p_supplier_id, 'payment', -p_amount, p_date, v_note, v_uid);
  update suppliers set current_balance = current_balance - p_amount where id = p_supplier_id;
end;
$$;

create or replace function public.create_purchase(
  p_supplier_id uuid, p_invoice_no text, p_date date, p_subtotal numeric, p_discount numeric,
  p_total numeric, p_paid numeric, p_note text, p_created_by uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_purchase_id uuid; v_item jsonb; v_due numeric; v_factor int;
begin
  if not exists (select 1 from users where id = v_uid and role = 'admin') then
    raise exception 'Access denied';
  end if;
  v_due := p_total - p_paid;
  insert into purchases (supplier_id, invoice_no, date, subtotal, discount, total, paid, due, note, created_by)
  values (p_supplier_id, p_invoice_no, p_date, p_subtotal, p_discount, p_total, p_paid, v_due, p_note, v_uid)
  returning id into v_purchase_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select factor into v_factor from product_units
    where product_id = (v_item->>'product_id')::uuid and unit_name = v_item->>'unit_name';
    if v_factor is null then v_factor := 1; end if;
    insert into purchase_items (purchase_id, product_id, unit_name, quantity, unit_cost, line_total)
    values (v_purchase_id, (v_item->>'product_id')::uuid, v_item->>'unit_name',
            (v_item->>'quantity')::int, (v_item->>'unit_cost')::numeric, (v_item->>'line_total')::numeric);
    update stock set quantity_in_base_unit = quantity_in_base_unit + ((v_item->>'quantity')::int * v_factor),
      updated_at = now() where product_id = (v_item->>'product_id')::uuid;
  end loop;
  if v_due > 0 then
    insert into supplier_ledger (supplier_id, type, amount, ref_purchase_id, date, note, created_by)
    values (p_supplier_id, 'purchase', v_due, v_purchase_id, p_date, p_note, v_uid);
  end if;
  update suppliers set current_balance = current_balance + v_due where id = p_supplier_id;
  return v_purchase_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Remove the open INSERT policies. These tables are written
--    only by the SECURITY DEFINER RPCs above (which bypass RLS),
--    so no direct-insert policy is needed. customer_ledger keeps
--    an admin-only policy for the opening-balance UI flow.
-- ─────────────────────────────────────────────────────────────
drop policy if exists sales_insert on public.sales;
drop policy if exists sale_items_insert on public.sale_items;
drop policy if exists audit_insert on public.audit_log;

drop policy if exists customer_ledger_insert on public.customer_ledger;
create policy customer_ledger_insert_admin on public.customer_ledger for insert
  with check (current_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 7. Reduce attack surface. Functions grant EXECUTE to PUBLIC by
--    default (which `anon` inherits), so we must revoke from PUBLIC
--    — revoking from `anon` alone is a no-op. Business/report RPCs
--    stay callable by signed-in users; trigger functions are not
--    reachable through the API at all (they fire from triggers,
--    which do not require EXECUTE on the calling role).
-- ─────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  for fn in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('current_user_role','create_sale','create_purchase','pay_customer','pay_supplier',
       'get_period_profit','get_dashboard_stats','get_sales_by_day','get_item_sales')
  loop
    execute 'revoke execute on function ' || fn || ' from public, anon';
    execute 'grant execute on function ' || fn || ' to authenticated';
  end loop;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_trigger_fn() from public, anon, authenticated;
