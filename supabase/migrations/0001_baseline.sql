-- =============================================================
-- Costmatic — Baseline schema (phases 1–8)
-- Faithful reconstruction of the live schema as built through
-- the original phase1..phase8 migrations. Reproduces the database
-- so a fresh Supabase project can be created from source.
-- The security hardening is applied separately in 0002.
-- =============================================================

-- ── Enums ──────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

-- ── Sequence (sale invoice numbers) ────────────────────────
create sequence if not exists public.sale_invoice_seq;

-- ── Helper: current user's role (SECURITY DEFINER avoids RLS
--    recursion when used inside policies) ─────────────────────
create or replace function public.current_user_role()
returns text language sql security definer set search_path to 'public'
as $$ select role::text from public.users where id = auth.uid() $$;

-- ── Tables ─────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null default '',
  full_name       text not null default '',
  username        text unique,
  role            public.user_role not null default 'employee',
  discount_limit  numeric(5,2) not null default 0 check (discount_limit >= 0 and discount_limit <= 100),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name_en     text not null,
  name_ur     text not null default '',
  parent_id   uuid references public.categories(id) on delete set null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  name_en         text not null,
  name_ur         text not null default '',
  category_id     uuid references public.categories(id) on delete set null,
  brand           text,
  barcode         text unique,
  image_url       text,
  base_unit       text not null default 'piece',
  cost_price      numeric(12,2) not null default 0,
  min_stock_level integer not null default 0,
  has_expiry      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.product_units (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  unit_name       text not null,
  factor          integer not null check (factor > 0),
  wholesale_price numeric(12,2) not null default 0,
  retail_price    numeric(12,2) not null default 0,
  barcode         text,
  created_at      timestamptz not null default now()
);

create table if not exists public.stock (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null unique references public.products(id) on delete cascade,
  quantity_in_base_unit integer not null default 0,
  batch_no              text,
  expiry_date           date,
  updated_at            timestamptz not null default now()
);

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  address         text,
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  invoice_no  text,
  date        date not null default current_date,
  subtotal    numeric(12,2) not null,
  discount    numeric(12,2) not null default 0,
  total       numeric(12,2) not null,
  paid        numeric(12,2) not null default 0,
  due         numeric(12,2) not null,
  note        text,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  unit_name   text not null,
  quantity    integer not null check (quantity > 0),
  unit_cost   numeric(12,2) not null,
  line_total  numeric(12,2) not null
);

create table if not exists public.supplier_ledger (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  type            text not null check (type in ('opening','purchase','payment','return','adjustment')),
  amount          numeric(12,2) not null,
  ref_purchase_id uuid references public.purchases(id) on delete set null,
  date            date not null default current_date,
  note            text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  address         text,
  customer_type   text not null default 'wholesale' check (customer_type in ('wholesale','retail')),
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.sales (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null,
  customer_id  uuid references public.customers(id) on delete set null,
  date         date not null default current_date,
  subtotal     numeric(12,2) not null,
  discount     numeric(12,2) not null default 0,
  tax          numeric(12,2) not null default 0,
  total        numeric(12,2) not null,
  paid         numeric(12,2) not null default 0,
  due          numeric(12,2) not null default 0,
  payment_type text not null check (payment_type in ('cash','udhaar','mixed')),
  created_by   uuid references public.users(id),
  is_void      boolean not null default false,
  created_at   timestamptz not null default now(),
  client_id    uuid unique
);

create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  unit_name    text not null,
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12,2) not null,
  discount_pct numeric(5,2) not null default 0,
  line_total   numeric(12,2) not null
);

create table if not exists public.customer_ledger (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type        text not null check (type in ('opening','sale','payment','return','adjustment')),
  amount      numeric(12,2) not null,
  ref_sale_id uuid references public.sales(id) on delete set null,
  date        date not null default current_date,
  note        text,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  uuid,
  action     text not null check (action in ('INSERT','UPDATE','DELETE')),
  user_id    uuid,
  user_name  text,
  summary    text,
  created_at timestamptz not null default now()
);

-- ── Enable RLS on every table ──────────────────────────────
alter table public.users           enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.product_units   enable row level security;
alter table public.stock           enable row level security;
alter table public.suppliers       enable row level security;
alter table public.purchases       enable row level security;
alter table public.purchase_items  enable row level security;
alter table public.supplier_ledger enable row level security;
alter table public.customers       enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.settings        enable row level security;
alter table public.audit_log       enable row level security;

-- ── RLS policies (baseline; tightened in 0002) ─────────────
-- users
create policy users_select on public.users for select
  using (id = auth.uid() or current_user_role() = 'admin');
create policy users_update_admin on public.users for update
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy users_insert_trigger on public.users for insert
  with check (id = auth.uid());

-- catalog: readable by all signed-in users, writable by admin
create policy categories_select on public.categories for select using (true);
create policy categories_write_admin on public.categories for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy products_select on public.products for select using (true);
create policy products_write_admin on public.products for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy product_units_select on public.product_units for select using (true);
create policy product_units_write_admin on public.product_units for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

create policy stock_select on public.stock for select using (true);
create policy stock_write_admin on public.stock for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- suppliers / purchases: admin-only (cost-sensitive)
create policy suppliers_select_admin on public.suppliers for select
  using (current_user_role() = 'admin');
create policy suppliers_write_admin on public.suppliers for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy purchases_admin on public.purchases for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy purchase_items_admin on public.purchase_items for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy supplier_ledger_admin on public.supplier_ledger for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- customers
create policy customers_select on public.customers for select using (true);
create policy customers_insert on public.customers for insert with check (true);
create policy customers_update_admin on public.customers for update
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy customers_delete_admin on public.customers for delete
  using (current_user_role() = 'admin');

-- sales / ledgers (NOTE: baseline leaves these open; 0002 locks them down)
create policy sales_select on public.sales for select using (true);
create policy sales_insert on public.sales for insert with check (true);
create policy sales_update_admin on public.sales for update
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy sale_items_select on public.sale_items for select using (true);
create policy sale_items_insert on public.sale_items for insert with check (true);
create policy customer_ledger_select on public.customer_ledger for select using (true);
create policy customer_ledger_insert on public.customer_ledger for insert with check (true);

-- settings / audit
create policy settings_select on public.settings for select using (true);
create policy settings_upsert_admin on public.settings for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy audit_select_admin on public.audit_log for select
  using (current_user_role() = 'admin');
create policy audit_insert on public.audit_log for insert with check (true);

-- ── Trigger: auto-create profile on sign-up ────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Audit trigger ──────────────────────────────────────────
create or replace function public.audit_trigger_fn()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid; v_uname text; v_sum text;
begin
  v_uid := auth.uid();
  select coalesce(full_name, email) into v_uname from users where id = v_uid;
  if tg_table_name = 'sales' then
    v_sum := tg_op || ' sale ' || coalesce(new.invoice_no, old.invoice_no, '');
  elsif tg_table_name = 'purchases' then
    v_sum := tg_op || ' purchase ' || coalesce(new.invoice_no::text, old.invoice_no::text, '');
  elsif tg_table_name = 'products' then
    v_sum := tg_op || ' product ' || coalesce(new.name_en, old.name_en, '');
  elsif tg_table_name = 'customers' then
    v_sum := tg_op || ' customer ' || coalesce(new.name, old.name, '');
  elsif tg_table_name = 'suppliers' then
    v_sum := tg_op || ' supplier ' || coalesce(new.name, old.name, '');
  else
    v_sum := tg_op || ' ' || tg_table_name;
  end if;
  insert into audit_log (table_name, record_id, action, user_id, user_name, summary)
  values (tg_table_name, coalesce(new.id, old.id), tg_op, v_uid, v_uname, v_sum);
  return coalesce(new, old);
end;
$$;

create trigger audit_sales     after insert or update or delete on public.sales     for each row execute function public.audit_trigger_fn();
create trigger audit_purchases after insert or update or delete on public.purchases for each row execute function public.audit_trigger_fn();
create trigger audit_products  after insert or update or delete on public.products  for each row execute function public.audit_trigger_fn();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.audit_trigger_fn();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_trigger_fn();

-- ── Report functions ───────────────────────────────────────
create or replace function public.get_sales_by_day(p_from date, p_to date)
returns table(sale_date date, invoice_count bigint, cash_total numeric, udhaar_total numeric, day_total numeric)
language sql security definer set search_path to 'public'
as $$
  select date as sale_date, count(*)::bigint as invoice_count,
         coalesce(sum(paid),0) as cash_total, coalesce(sum(due),0) as udhaar_total,
         coalesce(sum(total),0) as day_total
  from sales where date between p_from and p_to and not is_void
  group by date order by date desc
$$;

create or replace function public.get_item_sales(p_from date, p_to date)
returns table(product_name text, unit_name text, total_qty bigint, revenue numeric)
language sql security definer set search_path to 'public'
as $$
  select p.name_en as product_name, si.unit_name,
         sum(si.quantity)::bigint as total_qty, sum(si.line_total) as revenue
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  where s.date between p_from and p_to
  group by p.name_en, si.unit_name order by revenue desc limit 100
$$;

create or replace function public.get_period_profit(p_from date, p_to date)
returns numeric language sql security definer set search_path to 'public'
as $$
  select coalesce(sum(si.line_total - (p.cost_price * si.quantity * pu.factor)),0)
  from sale_items si
  join sales s on s.id = si.sale_id and not s.is_void
  join products p on p.id = si.product_id
  join product_units pu on pu.product_id = si.product_id and pu.unit_name = si.unit_name
  where s.date between p_from and p_to
$$;

create or replace function public.get_dashboard_stats(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_today_total numeric; v_today_cash numeric; v_today_udhaar numeric;
  v_today_invoices bigint; v_receivable numeric; v_payable numeric; v_low_stock bigint;
begin
  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0), count(*)
  into v_today_total, v_today_cash, v_today_udhaar, v_today_invoices
  from sales where date = p_date and not is_void;
  select coalesce(sum(greatest(current_balance,0)),0) into v_receivable from customers;
  select coalesce(sum(greatest(current_balance,0)),0) into v_payable from suppliers;
  select count(*) into v_low_stock from products p join stock s on s.product_id = p.id
  where p.is_active and s.quantity_in_base_unit <= p.min_stock_level;
  return jsonb_build_object(
    'today_total', v_today_total, 'today_cash', v_today_cash, 'today_udhaar', v_today_udhaar,
    'today_invoices', v_today_invoices, 'total_receivable', v_receivable,
    'total_payable', v_payable, 'low_stock_count', v_low_stock);
end;
$$;

-- ── Transactional RPCs ─────────────────────────────────────
create or replace function public.create_purchase(
  p_supplier_id uuid, p_invoice_no text, p_date date, p_subtotal numeric, p_discount numeric,
  p_total numeric, p_paid numeric, p_note text, p_created_by uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_purchase_id uuid; v_item jsonb; v_due numeric; v_factor int;
begin
  if not exists (select 1 from users where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied';
  end if;
  v_due := p_total - p_paid;
  insert into purchases (supplier_id, invoice_no, date, subtotal, discount, total, paid, due, note, created_by)
  values (p_supplier_id, p_invoice_no, p_date, p_subtotal, p_discount, p_total, p_paid, v_due, p_note, p_created_by)
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
    values (p_supplier_id, 'purchase', v_due, v_purchase_id, p_date, p_note, p_created_by);
  end if;
  update suppliers set current_balance = current_balance + v_due where id = p_supplier_id;
  return v_purchase_id;
end;
$$;

create or replace function public.create_sale(
  p_customer_id uuid, p_date date, p_subtotal numeric, p_discount numeric, p_tax numeric,
  p_total numeric, p_paid numeric, p_due numeric, p_payment_type text, p_created_by uuid,
  p_items jsonb, p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_sale_id uuid; v_invoice_no text; v_item jsonb; v_factor int; v_stock_qty int; v_prod_name text;
begin
  if p_client_id is not null then
    select id, invoice_no into v_sale_id, v_invoice_no from sales where client_id = p_client_id;
    if found then return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no); end if;
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select pu.factor into v_factor from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then v_factor := 1; end if;
    select s.quantity_in_base_unit, p.name_en into v_stock_qty, v_prod_name
    from stock s join products p on p.id = s.product_id where s.product_id = (v_item->>'product_id')::uuid;
    if coalesce(v_stock_qty,0) < (v_item->>'quantity')::int * v_factor then
      raise exception 'Insufficient stock: % (need %, have %)', v_prod_name,
        (v_item->>'quantity')::int * v_factor, coalesce(v_stock_qty,0);
    end if;
  end loop;
  v_invoice_no := 'INV-' || to_char(p_date,'YYYY') || '-' || lpad(nextval('sale_invoice_seq')::text,4,'0');
  insert into sales (invoice_no, customer_id, date, subtotal, discount, tax, total, paid, due, payment_type, created_by, client_id)
  values (v_invoice_no, p_customer_id, p_date, p_subtotal, p_discount, p_tax, p_total, p_paid, p_due, p_payment_type, p_created_by, p_client_id)
  returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select pu.factor into v_factor from product_units pu
    where pu.product_id = (v_item->>'product_id')::uuid and pu.unit_name = v_item->>'unit_name';
    if v_factor is null then v_factor := 1; end if;
    insert into sale_items (sale_id, product_id, unit_name, quantity, unit_price, discount_pct, line_total)
    values (v_sale_id, (v_item->>'product_id')::uuid, v_item->>'unit_name', (v_item->>'quantity')::int,
            (v_item->>'unit_price')::numeric, coalesce((v_item->>'discount_pct')::numeric,0), (v_item->>'line_total')::numeric);
    update stock set quantity_in_base_unit = quantity_in_base_unit - ((v_item->>'quantity')::int * v_factor),
      updated_at = now() where product_id = (v_item->>'product_id')::uuid;
  end loop;
  if p_due > 0 and p_customer_id is not null then
    insert into customer_ledger (customer_id, type, amount, ref_sale_id, date, created_by)
    values (p_customer_id, 'sale', p_due, v_sale_id, p_date, p_created_by);
    update customers set current_balance = current_balance + p_due where id = p_customer_id;
  end if;
  return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_invoice_no);
end;
$$;

create or replace function public.pay_customer(
  p_customer_id uuid, p_amount numeric, p_date date, p_note text, p_created_by uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  insert into customer_ledger (customer_id, type, amount, date, note, created_by)
  values (p_customer_id, 'payment', -p_amount, p_date, p_note, p_created_by);
  update customers set current_balance = current_balance - p_amount where id = p_customer_id;
end;
$$;

create or replace function public.pay_supplier(
  p_supplier_id uuid, p_amount numeric, p_method text, p_date date, p_note text, p_created_by uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_note text;
begin
  if not exists (select 1 from users where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied';
  end if;
  v_note := coalesce(p_method,'') || case when p_note != '' then ' — ' || p_note else '' end;
  insert into supplier_ledger (supplier_id, type, amount, date, note, created_by)
  values (p_supplier_id, 'payment', -p_amount, p_date, v_note, p_created_by);
  update suppliers set current_balance = current_balance - p_amount where id = p_supplier_id;
end;
$$;

-- ── Seed data ──────────────────────────────────────────────
insert into public.settings (key, value) values
  ('default_language','en'), ('shop_name',''), ('shop_address',''),
  ('shop_phone',''), ('tax_rate','0'), ('receipt_footer','Thank you for your business!')
on conflict (key) do nothing;

insert into public.categories (name_en, name_ur, sort_order) values
  ('Makeup','میک اپ',1), ('Skincare','اسکن کیئر',2), ('Perfumes','عطر',3),
  ('Soaps','صابن',4), ('Hair Oil','بالوں کا تیل',5), ('Oils','تیل',6),
  ('Deodorants','ڈیوڈرنٹ',7), ('Hair Care','ہیئر کیئر',8), ('Beauty Tools','بیوٹی ٹولز',9)
on conflict do nothing;
