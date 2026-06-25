# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A wholesale beauty/cosmetics shop management system for a Pakistani shop. Built as an online-first PWA that degrades gracefully offline. The master spec is `wholesale-shop-software-spec.md` — read the relevant section of it before starting any feature. Skills in `.claude/skills/` provide module-specific rules; they activate automatically when tasks match.

## Tech stack (do not substitute without asking)

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| Motion | Framer Motion |
| Data fetching | TanStack Query (with IndexedDB persistence for offline reads) |
| Routing | react-router |
| Backend | Supabase (PostgreSQL + Auth + Row-Level Security) |
| i18n | react-i18next (`locales/en.json` + `locales/ur.json`) |
| Barcode | `@zxing/library` (camera) + plain keyboard capture (USB scanner) |
| Barcode labels | bwip-js (Code128) |
| PWA | vite-plugin-pwa |
| Hosting | Vercel (frontend) + Supabase (backend) |

## Folder structure

```
src/
  app/          routing, layout shell, providers
  components/   shared UI (Button, Card, DataTable…)
  features/     one folder per domain: products, sales, customers,
                suppliers, purchases, reports, settings, auth
  lib/          supabase client, formatPKR(), unit helpers, i18n, query client
  locales/      en.json, ur.json
  hooks/  types/  styles/
```

Each feature folder is self-contained with its own components, hooks, queries, and types. Data access goes through TanStack Query hooks — never raw fetch in components.

## Key conventions

**Money:** store and compute in integer paisa or `numeric(12,2)` — never JavaScript floats. Use a single `formatPKR()` helper for all display. Money as float in the DB is a bug.

**i18n:** zero hardcoded user-facing strings. Every string gets a `t('key')` call. When you add a key to `en.json`, add the Urdu translation to `ur.json` in the same change. A missing Urdu key is a bug.

**RTL:** use Tailwind logical properties everywhere: `ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`/`text-end`. Never `pl-`, `ml-`, `left-`, `text-left`. Language toggle sets `document.documentElement.dir`.

**Colours:** only theme tokens from `tailwind.config.js` — no raw hex. Semantic meaning is fixed:
- `brand` teal `#0E6E58` → primary actions, active nav
- `cash` green `#15924F` → paid / cash
- `due` red `#D33A4F` → udhaar / amount owed / alerts
- `low` amber `#E08A1E` → low stock / near-expiry
- `accent` gold `#C99A3E` → logo only, never large fills

**Permissions:** always two layers. Supabase RLS is the real security; UI hiding is convenience only. Never rely on the UI layer alone.

## Database rules

Follow the schema in `wholesale-shop-software-spec.md` Section 8 exactly — same table and column names.

- All schema changes are committed SQL migrations, never hand-edits in the dashboard.
- Use snake_case, UUID primary keys, `created_at timestamptz default now()`.
- RLS must be ON for every table.
- Multi-step writes (sale, purchase, payment) must be atomic: use Postgres functions or Supabase RPCs so stock and balances can never be left inconsistent.

**Unit model (critical):** stock is always stored in the base unit (piece). `product_units` defines sellable units with a `factor`. Selling `q` units deducts `q × factor` pieces. See `wholesale-shop-software-spec.md` Section 9.

## Roles

Two roles: `admin` and `employee`. The permission matrix is in spec Section 4. Key employee restrictions enforced at the server:
- Cannot read `cost_price`, profit, or stock value
- Cannot write to products, purchases, suppliers, settings, or users
- Discount is capped at their `discount_limit`

**How these are actually enforced (see migration `0002_security_hardening.sql`):**
- `cost_price` does NOT live on `products` — Postgres RLS can't hide a single column
  when admin and employee share the `authenticated` role. It lives in a separate
  **`product_costs`** table with an admin-only RLS policy. Read it via the
  `product_costs(cost_price)` embed (empty array for employees); write it through the
  admin path in `useSaveProduct`. Do not add a `cost_price` column back to `products`.
- The discount cap and ALL sale money are recomputed server-side inside `create_sale`
  from the catalog + the caller's `discount_limit`; client-supplied totals/prices are
  ignored. `created_by` on every RPC is taken from `auth.uid()`, never the client arg.
- `profit` and supplier payables are gated to admins inside the RPCs, not just the UI.
- Tables written by the transactional RPCs (`sales`, `sale_items`, `customer_ledger`)
  have NO open INSERT policy — writes go only through the SECURITY DEFINER RPCs.

## Build phases

Build in order and test each phase before starting the next (spec Section 11):

| Phase | What |
|---|---|
| 0 | Project scaffold + routing + sidebar + login page + i18n + RTL + design tokens |
| 1 | Auth (Supabase email/password), role context, route guards, Users admin page, RLS |
| 2 | Products, categories, product_units, stock list |
| 3 | Suppliers, Purchases (stock-in) |
| 4 | POS billing screen + barcode scanning + receipts |
| 5 | Customers + Udhaar/Khata + receivables |
| 6 | Reports + Dashboard |
| 7 | Offline PWA + sync queue |
| 8 | Settings, barcode labels, audit log, CSV export, deploy |

## Offline / sync

v1 only until it works: TanStack Query persisted to IndexedDB for offline reads, a write queue for sales/payments made offline. Sync when online returns. Make sync idempotent (use client UUIDs as sale ids). Flag oversell conflicts to the admin rather than silently dropping. Do not introduce RxDB or PowerSync until v1 offline is proven working.

## Testing priorities

1. Money and ledger math unit tests (discounts, splits, running balance)
2. Stock conversion unit tests (piece count stays exact across units)
3. RLS integration tests (employee token must fail at the API for restricted actions)
4. Offline sync integration tests (uploads exactly once, no duplicate invoice numbers)
5. Critical-flow e2e with Playwright (scan → bill → print; payment → statement)

Always test with both roles and both languages on any UI change. Use a separate staging Supabase project — never test against live data.

## Deployment

- `VITE_SUPABASE_URL` and the anon key as Vercel env vars — never committed.
- Apply migrations to staging before production.
- Keep separate Supabase projects for staging and production.
