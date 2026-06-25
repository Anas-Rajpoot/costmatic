---
name: supabase-data-layer
description: The database layer for the wholesale shop app — Postgres tables, migrations, Row-Level Security (RLS), and the triggers that keep stock and ledgers correct. Use this whenever you create or change a table, write a migration, add a query/mutation, or touch anything involving stock counts, balances, or who-can-read-what. Apply it for ANY data change so integrity and permissions are never bypassed.
---

# Supabase data layer

Schema is defined in `wholesale-shop-software-spec.md` Section 8. Follow those table and column names exactly.

## Migrations
- Every schema change is a versioned SQL migration committed to the repo — never edit the DB by hand in the dashboard only.
- Use snake_case tables/columns, `id` UUID primary keys, `created_at timestamptz default now()`.

## Integrity (enforce in DB, not just app code)
- A **sale** must, in one transaction: insert `sales` + `sale_items`, decrease `stock` by `quantity × unit factor`, and for any credit portion insert `customer_ledger` rows and update `customers.current_balance`.
- A **payment** inserts a ledger row and lowers the balance.
- A **purchase** increases `stock` and updates `suppliers.current_balance`.
- Prefer Postgres functions/triggers or RPC for these multi-step writes so a half-finished sale can never corrupt stock or balances.
- Stock is always stored in the **base unit (piece)**; convert at the edges (see inventory-and-units).

## Row-Level Security (RLS) — mandatory
- Turn RLS ON for every table. The app uses the anon/auth key; nothing is safe without policies.
- Employees: may insert sales, payments, customers; read products WITHOUT cost columns; read their own sales.
- Admins: full read/write including cost, profit, purchases, suppliers, settings, users.
- Never expose `cost_price`, profit, or stock-value to employees — split cost into a view/policy admins only can read (see auth-and-rbac).

## Gotchas
- Money as integer paisa or numeric(12,2) — never float.
- Generate `invoice_no` server-side; handle offline-created duplicates at sync (see offline-sync-pwa).

## Definition of done
Migration committed, RLS policies written and tested for BOTH roles, and stock/ledger updates happen atomically with no way to leave them inconsistent.
