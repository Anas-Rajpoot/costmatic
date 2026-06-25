---
name: testing-qa
description: How to test the wholesale shop app so money, stock, roles, and sync are provably correct. Use this whenever you add a feature, fix a bug, or are about to ship — write/extend tests for billing math, ledger balances, stock conversions, RLS permissions, and offline sync. Apply it especially around anything touching money or stock, where a silent bug is expensive.
---

# Testing & QA

Test the things that cost real money if wrong.

## Priorities (highest value first)
1. **Money & ledger math** (unit tests): unit-price selection, discounts, tax, cash/udhaar/mixed splits; ledger running balance == `current_balance` after a sequence of sale/payment/return.
2. **Stock conversions** (unit tests): selling/returning/purchasing in piece/dozen/carton keeps piece-stock exact; no negative stock.
3. **RLS / permissions** (integration): as an employee token, attempts to read cost/profit or write purchases/users/settings MUST fail at the API, not just be hidden in the UI.
4. **Offline sync** (integration): queued sales upload exactly once; duplicate invoice numbers are impossible; oversell-on-sync is flagged.
5. **Critical flows** (e2e, e.g. Playwright): scan → bill → mixed payment → receipt; take payment → statement updates; record purchase → stock + payable update.

## Practices
- Use a separate Supabase test/staging project or seeded local instance — never test against live shop data.
- Seed realistic fixtures (cartons/dozens, a credit customer, a low-stock item, an expiring batch).
- Always test BOTH roles and BOTH languages/RTL on UI changes.
- Add a regression test for every bug before fixing it.

## Definition of done
Money and stock logic have unit tests, permission boundaries have an integration test proving the server denies employees, the main flows have an e2e test, and CI runs them before deploy.
