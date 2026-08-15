-- =============================================================
-- Costmatic — Migration 0011: sale returns (wapsi)
--
-- A customer brings goods back. The shop needs one atomic operation that:
--   • checks the returned quantity against what that invoice actually sold
--     (minus anything already returned on an earlier visit),
--   • prices the return from the ORIGINAL sale line, never from the client,
--   • puts the stock back,
--   • refunds either cash from the drawer or credit on the customer's khata.
--
-- Money and quantities are recomputed server-side exactly like create_sale;
-- the client only says which invoice, which lines, and how much of each.
-- =============================================================

-- ── 1. Tables ───────────────────────────────────────────────
create sequence if not exists public.sale_return_seq;

create table if not exists public.sale_returns (
  id            uuid primary key default gen_random_uuid(),
  return_no     text not null unique,
  sale_id       uuid not null references public.sales(id) on delete restrict,
  customer_id   uuid references public.customers(id) on delete set null,
  date          date not null default current_date,
  total         numeric(12,2) not null default 0,
  -- 'cash'  → money handed back from the drawer (no ledger entry)
  -- 'khata' → credited against what the customer owes
  refund_mode   text not null check (refund_mode in ('cash','khata')),
  note          text,
  created_by    uuid references public.users(id) on delete set null,
  client_id     uuid unique,          -- idempotency key (offline/retry safe)
  created_at    timestamptz not null default now()
);

create table if not exists public.sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id   uuid not null references public.products(id) on delete restrict,
  unit_name    text not null,
  quantity     numeric(12,3) not null check (quantity > 0),
  unit_price   numeric(12,2) not null,
  line_total   numeric(12,2) not null
);

create index if not exists sale_returns_sale_idx      on public.sale_returns(sale_id);
create index if not exists sale_returns_date_idx      on public.sale_returns(date);
create index if not exists sale_return_items_ret_idx  on public.sale_return_items(return_id);
create index if not exists sale_return_items_item_idx on public.sale_return_items(sale_item_id);

-- ── 2. RLS: readable by signed-in staff, written only by the RPC ──
alter table public.sale_returns      enable row level security;
alter table public.sale_return_items enable row level security;

drop policy if exists sale_returns_select on public.sale_returns;
create policy sale_returns_select on public.sale_returns for select
  using (auth.uid() is not null);

drop policy if exists sale_return_items_select on public.sale_return_items;
create policy sale_return_items_select on public.sale_return_items for select
  using (auth.uid() is not null);

-- Deleting/altering a return is an admin-only correction path.
drop policy if exists sale_returns_delete_admin on public.sale_returns;
create policy sale_returns_delete_admin on public.sale_returns for delete
  using (current_user_role() = 'admin');

-- ── 3. create_sale_return ───────────────────────────────────
-- p_items: [{ "sale_item_id": uuid, "quantity": numeric }, …]
create or replace function public.create_sale_return(
  p_sale_id uuid, p_date date, p_items jsonb, p_refund_mode text,
  p_note text default null, p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      text;
  v_ret_id    uuid;
  v_ret_no    text;
  v_mode      text := case when p_refund_mode = 'khata' then 'khata' else 'cash' end;
  v_sale      record;
  v_item      jsonb;
  v_si        record;
  v_qty       numeric;
  v_returned  numeric;
  v_factor    numeric;
  v_line      numeric;
  v_total     numeric := 0;
  v_kind      text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from users where id = v_uid;
  if v_role is null then raise exception 'Access denied'; end if;

  -- Idempotent replay: same client_id → return the original result.
  if p_client_id is not null then
    select id, return_no into v_ret_id, v_ret_no from sale_returns where client_id = p_client_id;
    if found then
      return jsonb_build_object('return_id', v_ret_id, 'return_no', v_ret_no,
                                'total', (select total from sale_returns where id = v_ret_id));
    end if;
  end if;

  select id, customer_id, is_void into v_sale from sales where id = p_sale_id;
  if not found then raise exception 'Invoice not found'; end if;
  if coalesce(v_sale.is_void, false) then raise exception 'That invoice is void'; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing selected to return';
  end if;

  -- Khata credit only makes sense for a named customer.
  if v_mode = 'khata' and v_sale.customer_id is null then
    raise exception 'A walk-in sale can only be refunded in cash';
  end if;

  v_ret_no := 'RET-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_return_seq')::text,4,'0');
  insert into sale_returns (return_no, sale_id, customer_id, date, total, refund_mode, note, created_by, client_id)
  values (v_ret_no, p_sale_id, v_sale.customer_id, p_date, 0, v_mode, p_note, v_uid, p_client_id)
  returning id into v_ret_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    select si.id, si.product_id, si.unit_name, si.quantity, si.unit_price, p.name_en, p.product_kind
      into v_si
    from sale_items si join products p on p.id = si.product_id
    where si.id = (v_item->>'sale_item_id')::uuid and si.sale_id = p_sale_id;
    if not found then raise exception 'That line does not belong to this invoice'; end if;

    -- Whole units for counted items; loose items may come back by weight.
    v_kind := coalesce(v_si.product_kind, 'standard');
    if v_kind = 'standard' and v_qty <> trunc(v_qty) then
      raise exception 'Whole quantity required for % (counted item)', v_si.name_en;
    end if;

    -- Never accept more than what is still returnable on this line.
    select coalesce(sum(ri.quantity), 0) into v_returned
      from sale_return_items ri where ri.sale_item_id = v_si.id;
    if v_qty > v_si.quantity - v_returned then
      raise exception 'Cannot return % of % — only % left on this invoice',
        v_qty, v_si.name_en, (v_si.quantity - v_returned);
    end if;

    -- Price comes from the original sale line, never from the client.
    v_line  := round(v_si.unit_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into sale_return_items (return_id, sale_item_id, product_id, unit_name, quantity, unit_price, line_total)
    values (v_ret_id, v_si.id, v_si.product_id, v_si.unit_name, v_qty, v_si.unit_price, v_line);

    select factor into v_factor from product_units
    where product_id = v_si.product_id and unit_name = v_si.unit_name;
    if v_factor is null then v_factor := 1; end if;

    update stock set quantity_in_base_unit = quantity_in_base_unit + (v_qty * v_factor),
      updated_at = now() where product_id = v_si.product_id;
  end loop;

  if v_total <= 0 then raise exception 'Nothing selected to return'; end if;

  update sale_returns set total = v_total where id = v_ret_id;

  -- Khata refund: credit the customer's account (balance may go negative =
  -- the shop owes them). A cash refund leaves the ledger alone — money out of
  -- the drawer, recorded by the return itself.
  if v_mode = 'khata' then
    insert into customer_ledger (customer_id, type, amount, ref_sale_id, date, note, created_by)
    values (v_sale.customer_id, 'return', -v_total, p_sale_id, p_date,
            'Return ' || v_ret_no || coalesce(' — ' || p_note, ''), v_uid);
    update customers set current_balance = current_balance - v_total
      where id = v_sale.customer_id;
  end if;

  return jsonb_build_object('return_id', v_ret_id, 'return_no', v_ret_no, 'total', v_total,
                            'refund_mode', v_mode);
end;
$$;

revoke execute on function public.create_sale_return(uuid, date, jsonb, text, text, uuid) from public, anon;
grant  execute on function public.create_sale_return(uuid, date, jsonb, text, text, uuid) to authenticated;

-- ── 4. Dashboard: today's returns, so the day's figures stay honest ──
create or replace function public.get_dashboard_stats(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_today_total numeric; v_today_cash numeric; v_today_udhaar numeric;
  v_today_invoices bigint; v_receivable numeric; v_payable numeric; v_low_stock bigint;
  v_today_returns numeric;
  v_is_admin boolean := current_user_role() = 'admin';
begin
  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0), count(*)
  into v_today_total, v_today_cash, v_today_udhaar, v_today_invoices
  from sales where date = p_date and not is_void;
  select coalesce(sum(total),0) into v_today_returns from sale_returns where date = p_date;
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
    'total_payable', v_payable, 'low_stock_count', v_low_stock,
    'today_returns', v_today_returns,
    'today_net', v_today_total - v_today_returns);
end;
$$;

revoke execute on function public.get_dashboard_stats(date) from public, anon;
grant  execute on function public.get_dashboard_stats(date) to authenticated;
