---
name: reports-dashboard
description: The dashboard and reports for the wholesale shop app — daily sales, item-wise sales, stock, stock value, profit, receivables, payables, low stock, and near-expiry. Use this whenever you build or change any chart, KPI card, summary, or report. Apply it so numbers tie out to the ledgers/stock AND so employees never see admin-only figures.
---

# Reports & dashboard

Report list: `wholesale-shop-software-spec.md` Section 5 (#2, #10).

## Role-aware visibility (critical)
- **Profit, cost, and stock value are admin-only.** Enforce at the data layer (auth-and-rbac / supabase-data-layer), not by hiding cards in the browser.
- Employees see only their own sales for the day. Admins see everything.

## Dashboard
- Admin: today's sales, cash vs udhaar split, total receivables, low-stock count, top products, (profit).
- Employee: their own sales total for today, low-stock count — nothing about cost or profit.

## Reports
- Sales by day/period and item-wise (use unit-aware quantities).
- Stock report + stock value (admin). Low stock and near-expiry.
- Receivables (who owes you) and payables (who you owe) — derived from the ledgers, must match customer/supplier balances exactly.
- Profit = revenue − cost, using the cost prices recorded at purchase time (admin only).

## Correctness
- Reports READ; they never mutate stock or balances.
- Numbers must reconcile: receivables total == sum of positive customer balances; sales totals == sum of invoices in range.
- Round consistently; format with the shared helper; charts use the semantic palette (design-system).

## Definition of done
Every figure ties back to source data, an employee account sees no cost/profit anywhere, and receivables/payables match the underlying ledgers to the paisa.
