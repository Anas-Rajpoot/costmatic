---
name: project-setup
description: Scaffolding and coding conventions for the wholesale shop app. Use this whenever you create the project, add a new page/route/module, set up the folder structure, install core libraries, or are unsure how this codebase is organised. Apply it before writing any feature so files, naming, and the stack stay consistent — even if the user only says "add a screen" or "set up the project".
---

# Project setup & conventions

Single source of truth: `wholesale-shop-software-spec.md`. Read Sections 2–3 before scaffolding.

## Stack (do not substitute without asking)
- React + TypeScript + Vite · Tailwind CSS + shadcn/ui · TanStack Query · react-router
- Supabase (Postgres + Auth + RLS) · react-i18next (English + Urdu, RTL) · vite-plugin-pwa
- Framer Motion for component motion

## Folder structure
```
src/
  app/            routing, layout shell, providers
  components/     shared UI (Button, Card, DataTable…)
  features/       one folder per domain: products, sales, customers,
                  suppliers, purchases, reports, settings, auth
  lib/            supabase client, money/format, units, i18n, query client
  locales/        en.json, ur.json
  hooks/  types/  styles/
```
Keep each feature self-contained (its own components, hooks, queries, types).

## Conventions
- Money: store and compute in integer **paisa** or 2-dp decimals consistently; never float-add prices in the UI. One `formatPKR()` helper. Round every displayed number.
- All user-facing text comes from i18n keys — never hardcode strings (see bilingual-urdu-rtl).
- All colours/spacing come from the Tailwind theme tokens (see design-system) — no ad-hoc hex.
- Data access goes through TanStack Query hooks in the feature folder, never raw fetch in components.
- Server is the source of truth for permissions; the UI only hides what the server already forbids (see auth-and-rbac).

## Definition of done
- New route is registered, lazy-loaded, guarded by role, and appears in the sidebar with an i18n label + icon.
- Works in both English (LTR) and Urdu (RTL).
- No hardcoded strings, colours, or magic numbers.

## When stuck
Point back to the relevant spec section rather than inventing a new pattern.
