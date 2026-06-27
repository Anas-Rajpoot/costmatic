-- =============================================================
-- Costmatic — Migration 0005: explicit retail / wholesale sale mode
--
-- The POS now has a Retail/Wholesale toggle that decides which price column is
-- used, independent of the customer. The chosen mode is stored on each sale so
-- reports can split retail vs wholesale (combined remains the default).
-- =============================================================

alter table public.sales add column if not exists sale_type text not null default 'retail'
  check (sale_type in ('retail','wholesale'));

-- Backfill existing rows from the customer type (retail customer -> retail, else wholesale)
update public.sales s set sale_type =
  case when exists (select 1 from customers c where c.id = s.customer_id and c.customer_type = 'retail')
       then 'retail' else 'wholesale' end;

-- create_sale: pricing driven by the explicit sale mode (not the customer); mode stored.
drop function if exists public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid);

create or replace function public.create_sale(
  p_customer_id uuid, p_date date, p_subtotal numeric, p_discount numeric, p_tax numeric,
  p_total numeric, p_paid numeric, p_due numeric, p_payment_type text, p_created_by uuid,
  p_items jsonb, p_client_id uuid default null, p_sale_type text default 'retail')
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_limit      numeric;
  v_sale_type  text := case when p_sale_type = 'wholesale' then 'wholesale' else 'retail' end;
  v_is_retail  boolean := (v_sale_type = 'retail');
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
  if p_client_id is not null then
    select id, invoice_no into v_sale_id, v_invoice_no from sales where client_id = p_client_id;
    if found then return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no); end if;
  end if;
  select case when role = 'admin' then 100 else discount_limit end
    into v_limit from users where id = v_uid;
  if v_limit is null then raise exception 'Access denied'; end if;

  v_invoice_no := 'INV-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_invoice_seq')::text,4,'0');
  insert into sales (invoice_no, customer_id, date, subtotal, discount, tax, total, paid, due, payment_type, created_by, client_id, sale_type)
  values (v_invoice_no, p_customer_id, p_date, 0, v_hdr_disc, v_tax, 0, 0, 0, p_payment_type, v_uid, p_client_id, v_sale_type)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select pu.factor, case when v_is_retail then pu.retail_price else pu.wholesale_price end
      into v_factor, v_list
    from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then
      raise exception 'Unknown unit % for product %', v_item->>'unit_name', v_item->>'product_id';
    end if;
    v_disc := coalesce((v_item->>'discount_pct')::numeric, 0);
    if v_disc < 0 then v_disc := 0; end if;
    if v_disc > v_limit then
      raise exception 'Discount % %% exceeds your limit of % %%', v_disc, v_limit;
    end if;
    v_unit_price := round(v_list * (1 - v_disc/100), 2);
    v_line_total := round(v_list * (1 - v_disc/100) * (v_item->>'quantity')::int, 2);
    v_subtotal   := v_subtotal + v_line_total;
    select s.quantity_in_base_unit, p.name_en into v_stock_qty, v_prod_name
    from stock s join products p on p.id = s.product_id where s.product_id = (v_item->>'product_id')::uuid;
    if coalesce(v_stock_qty,0) < (v_item->>'quantity')::int * v_factor then
      raise exception 'Insufficient stock: % (need %, have %)', v_prod_name,
        (v_item->>'quantity')::int * v_factor, coalesce(v_stock_qty,0);
    end if;
    insert into sale_items (sale_id, product_id, unit_name, quantity, unit_price, discount_pct, line_total)
    values (v_sale_id, (v_item->>'product_id')::uuid, v_item->>'unit_name', (v_item->>'quantity')::int,
            v_unit_price, v_disc, v_line_total);
    update stock set quantity_in_base_unit = quantity_in_base_unit - ((v_item->>'quantity')::int * v_factor),
      updated_at = now() where product_id = (v_item->>'product_id')::uuid;
  end loop;

  v_total := round(v_subtotal - v_hdr_disc + v_tax, 2);
  if v_total < 0 then v_total := 0; end if;
  v_paid := least(greatest(coalesce(p_paid, 0), 0), v_total);
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
revoke execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text) to authenticated;

-- ── Report RPCs gain an optional sale_type filter (null = all) ──
drop function if exists public.get_sales_by_day(date, date);
create or replace function public.get_sales_by_day(p_from date, p_to date, p_sale_type text default null)
returns table(sale_date date, invoice_count bigint, cash_total numeric, udhaar_total numeric, day_total numeric)
language sql security definer set search_path to 'public'
as $$
  select date as sale_date, count(*)::bigint as invoice_count,
         coalesce(sum(paid),0) as cash_total, coalesce(sum(due),0) as udhaar_total,
         coalesce(sum(total),0) as day_total
  from sales
  where date between p_from and p_to and not is_void
    and (p_sale_type is null or sale_type = p_sale_type)
  group by date order by date desc
$$;

drop function if exists public.get_item_sales(date, date);
create or replace function public.get_item_sales(p_from date, p_to date, p_sale_type text default null)
returns table(product_name text, unit_name text, total_qty bigint, revenue numeric)
language sql security definer set search_path to 'public'
as $$
  select p.name_en as product_name, si.unit_name,
         sum(si.quantity)::bigint as total_qty, sum(si.line_total) as revenue
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  where s.date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type)
  group by p.name_en, si.unit_name order by revenue desc limit 100
$$;

drop function if exists public.get_period_profit(date, date);
create or replace function public.get_period_profit(p_from date, p_to date, p_sale_type text default null)
returns numeric language plpgsql security definer set search_path to 'public'
as $$
declare v_total numeric;
begin
  if current_user_role() <> 'admin' then raise exception 'Access denied'; end if;
  select coalesce(sum(si.line_total - (coalesce(pc.cost_price,0) * si.quantity * pu.factor)),0)
  into v_total
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  join product_units pu on pu.product_id = si.product_id and pu.unit_name = si.unit_name
  left join product_costs pc on pc.product_id = si.product_id
  where s.date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type);
  return v_total;
end;
$$;

-- ── Retail vs wholesale split for a period (always returns both) ──
create or replace function public.get_sales_split(p_from date, p_to date)
returns jsonb language sql security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'retail_total',    coalesce(sum(total) filter (where sale_type = 'retail'), 0),
    'retail_count',    count(*) filter (where sale_type = 'retail'),
    'wholesale_total', coalesce(sum(total) filter (where sale_type = 'wholesale'), 0),
    'wholesale_count', count(*) filter (where sale_type = 'wholesale')
  )
  from sales where date between p_from and p_to and not is_void
$$;

revoke execute on function public.get_sales_by_day(date, date, text) from public, anon;
revoke execute on function public.get_item_sales(date, date, text) from public, anon;
revoke execute on function public.get_period_profit(date, date, text) from public, anon;
revoke execute on function public.get_sales_split(date, date) from public, anon;
grant execute on function public.get_sales_by_day(date, date, text) to authenticated;
grant execute on function public.get_item_sales(date, date, text) to authenticated;
grant execute on function public.get_period_profit(date, date, text) to authenticated;
grant execute on function public.get_sales_split(date, date) to authenticated;
