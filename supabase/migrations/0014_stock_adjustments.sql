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
