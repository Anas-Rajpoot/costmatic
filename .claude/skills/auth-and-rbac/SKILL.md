---
name: auth-and-rbac
description: Authentication and the admin-vs-employee permission model for the wholesale shop app. Use this whenever you build login, add a protected route or action, show/hide a feature, or handle anything an employee should NOT be able to see or do (cost prices, profit, deleting invoices, managing users, settings). Apply it to every new screen so restrictions are enforced, not just hinted at.
---

# Auth & role-based access (RBAC)

Roles for v1: `admin` and `employee`. Permission matrix is in `wholesale-shop-software-spec.md` Section 4.

## Two layers, always both
1. **Server (real security):** Supabase RLS + policies decide what each role can read/write (see supabase-data-layer). This is what actually protects data.
2. **UI (convenience):** route guards and conditional rendering hide what the server already forbids. Never rely on the UI alone.

## Employee restrictions (enforce server-side)
Cannot: see cost price / profit / stock value, change prices, do purchases, manage suppliers, delete or void invoices, manage users, open settings, or see other staff's sales. Discounts are capped at their `discount_limit`.

## Employee allowances
Can: log in, run POS billing, add/edit customers, take customer payments, do returns on their own sales, and view their own sales for the day.

## Implementation
- Load the user's role into an auth context on login; expose a `can(action)` helper and a `<RequireRole>` route guard.
- Gate sensitive columns at the data layer (a cost-free product view for employees), not by filtering in the browser.
- Write important actions (sale, void, price change, payment, login) to `audit_log` with the user id.

## Definition of done
Logging in as an employee genuinely cannot reach cost/profit/settings/users even by typing the URL or calling the API directly, discount cap is enforced, and the action is in the audit log.
