---
name: deployment
description: Shipping and operating the wholesale shop app — deploying the frontend to Vercel, configuring Supabase, environment variables, database backups, and installing the PWA in the shop. Use this whenever you set up hosting, env config, a release, migrations in production, or backups. Apply it so going live is safe and the shop's data is protected.
---

# Deployment & operations

Targets: Vercel (frontend) + Supabase (backend). See `wholesale-shop-software-spec.md` Section 12.

## Deploy
- Frontend → Vercel from GitHub. Set `VITE_SUPABASE_URL` and the anon key as env vars (never commit secrets).
- Backend → Supabase project. Apply migrations through the committed SQL (not hand edits). Run migrations on staging before production.
- Keep separate Supabase projects for staging and production.

## Go-live checklist
- RLS is ON for every table and verified for both roles (auth-and-rbac, testing-qa).
- Daily automated DB backups enabled; do a test restore once.
- Seed the first admin user; create employee accounts with discount limits.
- Fill Settings: shop name/logo, address, phone, tax rate, default language, receipt header/footer.
- Install the PWA on the billing PC and the owner's phone ("Add to Home Screen").
- Verify a real receipt prints on the shop's thermal printer and a USB scan works.

## Operations
- Provide CSV export/backup of products, customers, and ledgers the owner can download.
- Document how to add a product, take a payment, and read the receivables report (a one-page Urdu/English guide).
- Plan migrations carefully: additive first, backfill, then switch — never drop columns with live data without a backup.

## Definition of done
A clean deploy works end-to-end on real shop hardware (scan, bill, print, sync), backups run daily, both roles are correct in production, and the owner can export their data.
