-- =============================================================
-- Costmatic — Migration 0004: allow deleting a staff user
--
-- Deleting an auth user cascades to public.users (ON DELETE CASCADE). But their
-- past sales/purchases/ledger rows reference users(id) via created_by; without a
-- rule that would block deletion. Switch those to ON DELETE SET NULL so the
-- history is preserved (audit_log already snapshots the user's name).
-- =============================================================

alter table public.sales drop constraint sales_created_by_fkey,
  add constraint sales_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;

alter table public.purchases drop constraint purchases_created_by_fkey,
  add constraint purchases_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;

alter table public.customer_ledger drop constraint customer_ledger_created_by_fkey,
  add constraint customer_ledger_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;

alter table public.supplier_ledger drop constraint supplier_ledger_created_by_fkey,
  add constraint supplier_ledger_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;
