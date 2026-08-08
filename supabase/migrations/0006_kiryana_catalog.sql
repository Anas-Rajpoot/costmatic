-- =============================================================
-- Costmatic — Migration 0006: Kiryana catalog (Phase A)
--
-- Adds the foundation for a general-grocery (kiryana) store:
--   1. products.product_kind          ('standard' | 'loose')
--   2. Numeric quantities              (weight/volume selling, e.g. 0.350 kg)
--   3. create_sale v3                  loose "by amount" mode (Rs X of an item),
--                                      mode-aware (retail/wholesale) rate for
--                                      loose items, AND the H2 fix: the header
--                                      discount is now capped server-side.
--
-- Backward compatible: every existing product defaults to 'standard' and the
-- create_sale item payload's new fields (input_mode/amount) are optional, so the
-- current POS keeps working unchanged. No frontend change is required by Phase A.
--
-- Confirmed product decisions baked in here:
--   • Amount-mode line_total = the exact amount tendered (qty is derived/approx).
--   • No minimum loose quantity — only qty > 0.
--   • Loose amount-mode uses the sale mode's rate (wholesale rate for wholesale).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. product_kind: drives POS behaviour (fractional qty + by-amount).
--    'standard' = counted goods (piece / packaged / beverage bottle+crate)
--    'loose'    = weight/volume goods (cheeni, dal, ghee) — fractional allowed
--    Beverages need NO new kind: they are 'standard' with a 'crate' unit.
-- ─────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists product_kind text not null default 'standard'
    check (product_kind in ('standard','loose'));

-- ─────────────────────────────────────────────────────────────
-- 2. Numeric widening. integer -> numeric(12,3) is a lossless upcast, so all
--    existing counted-goods rows are preserved exactly. 3 decimals = 1 gram / 1 ml
--    precision when the base unit is kg / litre. App layer keeps 'standard'
--    products integer; the create_sale RPC enforces that too (whole-qty guard).
-- ─────────────────────────────────────────────────────────────
alter table public.product_units  alter column factor                type numeric(12,3);
alter table public.product_units  drop constraint if exists product_units_factor_check;
alter table public.product_units  add  constraint product_units_factor_check check (factor > 0);

alter table public.sale_items     alter column quantity              type numeric(12,3);
alter table public.sale_items     drop constraint if exists sale_items_quantity_check;
alter table public.sale_items     add  constraint sale_items_quantity_check check (quantity > 0);

alter table public.purchase_items alter column quantity              type numeric(12,3);
alter table public.purchase_items drop constraint if exists purchase_items_quantity_check;
alter table public.purchase_items add  constraint purchase_items_quantity_check check (quantity > 0);

alter table public.stock          alter column quantity_in_base_unit type numeric(12,3);

-- ─────────────────────────────────────────────────────────────
-- 3. create_sale v3.
--    Same signature as 0005 (no new function params) — the new per-item options
--    live inside the p_items JSON, so callers that don't send them are unaffected.
--
--    Per item, p_items[] may now include:
--      input_mode : 'qty' (default) | 'amount'
--      quantity   : numeric   (qty mode; fractional allowed for loose)
--      amount     : numeric   (amount mode; Rs value the customer asked for)
--
--    Server remains fully authoritative:
--      • unit price + factor always come from the catalog (never the client)
--      • retail vs wholesale rate is chosen by p_sale_type (the POS mode toggle)
--      • amount mode reverse-calculates weight from the mode's rate, server-side
--      • per-item discount cap AND header discount cap enforced (H2 fix)
--      • created_by is auth.uid()
-- ─────────────────────────────────────────────────────────────
drop function if exists public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text);

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
  v_mode       text;
  v_kind       text;
  v_factor     numeric;
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

  -- Idempotency for offline replays
  if p_client_id is not null then
    select id, invoice_no into v_sale_id, v_invoice_no from sales where client_id = p_client_id;
    if found then return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no); end if;
  end if;

  -- Caller's discount ceiling (admins effectively uncapped)
  select case when role = 'admin' then 100 else discount_limit end
    into v_limit from users where id = v_uid;
  if v_limit is null then raise exception 'Access denied'; end if;

  v_invoice_no := 'INV-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_invoice_seq')::text,4,'0');
  insert into sales (invoice_no, customer_id, date, subtotal, discount, tax, total, paid, due, payment_type, created_by, client_id, sale_type)
  values (v_invoice_no, p_customer_id, p_date, 0, 0, v_tax, 0, 0, 0, p_payment_type, v_uid, p_client_id, v_sale_type)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_mode := coalesce(v_item->>'input_mode', 'qty');

    -- Catalog lookup: factor + the sale-mode's rate (never trust client prices)
    select pu.factor, case when v_is_retail then pu.retail_price else pu.wholesale_price end
      into v_factor, v_list
    from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then
      raise exception 'Unknown unit % for product %', v_item->>'unit_name', v_item->>'product_id';
    end if;

    -- Product kind + current stock + name (one lookup)
    select s.quantity_in_base_unit, p.name_en, p.product_kind
      into v_stock_qty, v_prod_name, v_kind
    from products p left join stock s on s.product_id = p.id
    where p.id = (v_item->>'product_id')::uuid;

    if v_mode = 'amount' then
      -- "Rs X of this item" — only meaningful for loose (weight/volume) goods.
      if coalesce(v_kind,'standard') <> 'loose' then
        raise exception 'Amount-mode is only valid for loose items (%).', v_prod_name;
      end if;
      if coalesce(v_list,0) <= 0 then
        raise exception 'No % price set for %', v_sale_type, v_prod_name;
      end if;
      v_amount := coalesce((v_item->>'amount')::numeric, 0);
      if v_amount <= 0 then raise exception 'Amount must be greater than zero for %', v_prod_name; end if;
      -- Reverse-calc the weight from the mode's rate; line_total is pinned to the
      -- exact amount tendered (confirmed decision), so a rounding residual may stay
      -- in stock. Discount does not apply in amount mode.
      v_qty        := round(v_amount / v_list, 3);
      v_disc       := 0;
      v_unit_price := v_list;
      v_line_total := round(v_amount, 2);
    else
      v_qty := coalesce((v_item->>'quantity')::numeric, 0);
      if v_qty <= 0 then raise exception 'Quantity must be greater than zero for %', v_prod_name; end if;
      -- Counted goods cannot be sold in fractions
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

    v_subtotal := v_subtotal + v_line_total;

    -- Stock check + deduction, in base units (numeric)
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

  -- H2 fix: cap the header discount to the caller's limit (% of subtotal).
  -- Previously p_discount was applied uncapped, letting an employee zero a bill
  -- by calling the RPC directly. Admins (limit 100) are effectively uncapped.
  if v_hdr_disc < 0 then v_hdr_disc := 0; end if;
  v_max_hdr := round(v_subtotal * v_limit / 100, 2);
  if v_hdr_disc > v_max_hdr then
    raise exception 'Header discount % exceeds your limit (max % for this sale)', v_hdr_disc, v_max_hdr;
  end if;

  -- Authoritative totals
  v_total := round(v_subtotal - v_hdr_disc + v_tax, 2);
  if v_total < 0 then v_total := 0; end if;
  v_paid  := least(greatest(coalesce(p_paid, 0), 0), v_total);
  if v_paid < v_total and p_customer_id is null then
    raise exception 'Udhaar (credit) sale requires a customer';
  end if;
  v_due := v_total - v_paid;

  update sales set subtotal = v_subtotal, discount = v_hdr_disc, total = v_total, paid = v_paid, due = v_due
    where id = v_sale_id;

  if v_due > 0 and p_customer_id is not null then
    insert into customer_ledger (customer_id, type, amount, ref_sale_id, date, created_by)
    values (p_customer_id, 'sale', v_due, v_sale_id, p_date, v_uid);
    update customers set current_balance = current_balance + v_due where id = p_customer_id;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no);
end;
$$;

revoke execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text) from public, anon;
grant  execute on function public.create_sale(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, uuid, jsonb, uuid, text) to authenticated;
