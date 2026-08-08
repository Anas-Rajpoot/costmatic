-- =============================================================
-- Costmatic — Migration 0008: retail/wholesale eligibility + loose min + override
--
-- General rule (all categories): RETAIL sells the smallest sellable unit,
-- WHOLESALE sells the bulk unit. Enforced server-authoritatively:
--   • product_units.retail_eligible / wholesale_eligible  (per-unit flags)
--   • products.wholesale_min_qty                          (loose bulk minimum)
--   • create_sale v4 gains p_allow_override (admin-only) + sales.override_by audit
--
-- Backward compatible: flags default TRUE, wholesale_min_qty NULL, override FALSE
-- → every existing product keeps selling in both modes with any unit, unchanged.
-- =============================================================

-- ── 1. Schema ───────────────────────────────────────────────
alter table public.product_units
  add column if not exists retail_eligible    boolean not null default true,
  add column if not exists wholesale_eligible boolean not null default true;

alter table public.products
  add column if not exists wholesale_min_qty numeric(12,3);  -- base units; null = no minimum

alter table public.sales
  add column if not exists override_by uuid references public.users(id);  -- admin who bypassed limits

-- ── 2. create_sale v4 ───────────────────────────────────────
--    Adds eligibility + loose-minimum enforcement and an admin-only override.
drop function if exists public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text);

create or replace function public.create_sale(
  p_customer_id uuid, p_date date, p_subtotal numeric, p_discount numeric, p_tax numeric,
  p_total numeric, p_paid numeric, p_due numeric, p_payment_type text, p_created_by uuid,
  p_items jsonb, p_client_id uuid default null, p_sale_type text default 'retail',
  p_allow_override boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_role       text;
  v_is_admin   boolean;
  v_override   boolean;
  v_limit      numeric;
  v_sale_type  text := case when p_sale_type = 'wholesale' then 'wholesale' else 'retail' end;
  v_is_retail  boolean := (v_sale_type = 'retail');
  v_sale_id    uuid;
  v_invoice_no text;
  v_item       jsonb;
  v_mode       text;
  v_kind       text;
  v_base       text;
  v_wmin       numeric;
  v_factor     numeric;
  v_ret_ok     boolean;
  v_whol_ok    boolean;
  v_stock_qty  numeric;
  v_prod_name  text;
  v_disc       numeric;
  v_list       numeric;
  v_amount     numeric;
  v_qty        numeric;
  v_need       numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal   numeric := 0;
  v_total      numeric;
  v_paid       numeric;
  v_due        numeric;
  v_hdr_disc   numeric := coalesce(p_discount, 0);
  v_max_hdr    numeric;
  v_tax        numeric := coalesce(p_tax, 0);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_client_id is not null then
    select id, invoice_no into v_sale_id, v_invoice_no from sales where client_id = p_client_id;
    if found then return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no); end if;
  end if;

  select role, case when role = 'admin' then 100 else discount_limit end
    into v_role, v_limit from users where id = v_uid;
  if v_limit is null then raise exception 'Access denied'; end if;
  v_is_admin := (v_role = 'admin');
  -- Override only honoured for admins; an employee-supplied flag is ignored.
  v_override := coalesce(p_allow_override, false) and v_is_admin;

  v_invoice_no := 'INV-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_invoice_seq')::text,4,'0');
  insert into sales (invoice_no, customer_id, date, subtotal, discount, tax, total, paid, due, payment_type, created_by, client_id, sale_type)
  values (v_invoice_no, p_customer_id, p_date, 0, 0, v_tax, 0, 0, 0, p_payment_type, v_uid, p_client_id, v_sale_type)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_mode := coalesce(v_item->>'input_mode', 'qty');

    -- Catalog: factor, mode rate, and eligibility flags (never trust client)
    select pu.factor,
           case when v_is_retail then pu.retail_price else pu.wholesale_price end,
           pu.retail_eligible, pu.wholesale_eligible
      into v_factor, v_list, v_ret_ok, v_whol_ok
    from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then
      raise exception 'Unknown unit % for product %', v_item->>'unit_name', v_item->>'product_id';
    end if;

    select s.quantity_in_base_unit, p.name_en, p.product_kind, p.base_unit, p.wholesale_min_qty
      into v_stock_qty, v_prod_name, v_kind, v_base, v_wmin
    from products p left join stock s on s.product_id = p.id
    where p.id = (v_item->>'product_id')::uuid;

    -- ── Eligibility (skip when an admin overrides) ──
    if not v_override then
      if v_is_retail and not coalesce(v_ret_ok, true) then
        raise exception '% cannot be sold retail as "%". Use the retail unit or an admin override.',
          v_prod_name, v_item->>'unit_name';
      end if;
      if not v_is_retail and not coalesce(v_whol_ok, true) then
        raise exception '% cannot be sold wholesale as "%". Use the wholesale unit or an admin override.',
          v_prod_name, v_item->>'unit_name';
      end if;
    end if;

    if v_mode = 'amount' then
      if coalesce(v_kind,'standard') <> 'loose' then
        raise exception 'Amount-mode is only valid for loose items (%).', v_prod_name;
      end if;
      if coalesce(v_list,0) <= 0 then
        raise exception 'No % price set for %', v_sale_type, v_prod_name;
      end if;
      v_amount := coalesce((v_item->>'amount')::numeric, 0);
      if v_amount <= 0 then raise exception 'Amount must be greater than zero for %', v_prod_name; end if;
      v_qty        := round(v_amount / v_list, 3);
      v_disc       := 0;
      v_unit_price := v_list;
      v_line_total := round(v_amount, 2);
    else
      v_qty := coalesce((v_item->>'quantity')::numeric, 0);
      if v_qty <= 0 then raise exception 'Quantity must be greater than zero for %', v_prod_name; end if;
      if coalesce(v_kind,'standard') = 'standard' and v_qty <> trunc(v_qty) then
        raise exception 'Whole quantity required for % (counted item)', v_prod_name;
      end if;
      v_disc := coalesce((v_item->>'discount_pct')::numeric, 0);
      if v_disc < 0 then v_disc := 0; end if;
      if v_disc > v_limit then
        raise exception 'Discount % %% exceeds your limit of % %%', v_disc, v_limit;
      end if;
      v_unit_price := round(v_list * (1 - v_disc/100), 2);
      v_line_total := round(v_list * (1 - v_disc/100) * v_qty, 2);
    end if;

    -- ── Loose wholesale minimum (skip when an admin overrides) ──
    if not v_override and coalesce(v_kind,'standard') = 'loose' and not v_is_retail
       and v_wmin is not null and v_qty < v_wmin then
      raise exception 'Wholesale minimum for % is % %s (got %)', v_prod_name, v_wmin, v_base, v_qty;
    end if;

    v_subtotal := v_subtotal + v_line_total;

    v_need := v_qty * v_factor;
    if coalesce(v_stock_qty,0) < v_need then
      raise exception 'Insufficient stock: % (need %, have %)', v_prod_name, v_need, coalesce(v_stock_qty,0);
    end if;

    insert into sale_items (sale_id, product_id, unit_name, quantity, unit_price, discount_pct, line_total)
    values (v_sale_id, (v_item->>'product_id')::uuid, v_item->>'unit_name', v_qty,
            v_unit_price, v_disc, v_line_total);

    update stock set quantity_in_base_unit = quantity_in_base_unit - v_need,
      updated_at = now() where product_id = (v_item->>'product_id')::uuid;
  end loop;

  if v_hdr_disc < 0 then v_hdr_disc := 0; end if;
  v_max_hdr := round(v_subtotal * v_limit / 100, 2);
  if v_hdr_disc > v_max_hdr then
    raise exception 'Header discount % exceeds your limit (max % for this sale)', v_hdr_disc, v_max_hdr;
  end if;

  v_total := round(v_subtotal - v_hdr_disc + v_tax, 2);
  if v_total < 0 then v_total := 0; end if;
  v_paid  := least(greatest(coalesce(p_paid, 0), 0), v_total);
  if v_paid < v_total and p_customer_id is null then
    raise exception 'Udhaar (credit) sale requires a customer';
  end if;
  v_due := v_total - v_paid;

  update sales set subtotal = v_subtotal, discount = v_hdr_disc, total = v_total, paid = v_paid, due = v_due,
    override_by = case when v_override then v_uid else null end
    where id = v_sale_id;

  if v_due > 0 and p_customer_id is not null then
    insert into customer_ledger (customer_id, type, amount, ref_sale_id, date, created_by)
    values (p_customer_id, 'sale', v_due, v_sale_id, p_date, v_uid);
    update customers set current_balance = current_balance + v_due where id = p_customer_id;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no);
end;
$$;

revoke execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text, boolean) from public, anon;
grant  execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text, boolean) to authenticated;
