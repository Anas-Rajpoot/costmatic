---
name: purchases-suppliers
description: Purchasing / stock-in and supplier management for the wholesale shop app — recording goods bought, increasing stock, and tracking what you owe each supplier. Use this whenever you build the purchase entry flow, supplier records, supplier balances/payments, or anything that brings inventory IN. Apply it so stock and supplier balances update together and correctly.
---

# Purchases & suppliers

Flow: `wholesale-shop-software-spec.md` Section 5 (#5–6); ledger pattern in udhaar-khata.

## Stock-in flow (admin only)
1. Pick supplier (or create one).
2. Add lines: product, unit, quantity, unit cost. Optionally update the product's cost price.
3. Set amount paid now; the rest becomes supplier credit (what you owe).
4. Save atomically: increase `stock` by `quantity × unit factor` (pieces), insert `purchases` + `purchase_items`, post a `supplier_ledger` `purchase` row, update `suppliers.current_balance`.

## Suppliers
- Running balance = what you owe. Show a per-supplier statement and a "pay supplier" action (mirrors customer payments).
- Payables report lists suppliers you owe, largest first.

## Rules
- Purchases are admin-only (auth-and-rbac); cost data stays hidden from employees.
- Purchase returns reduce stock and reduce what you owe (a `return` ledger row).
- Keep cost prices for profit reporting (reports-dashboard).

## Gotchas
- Convert purchase units to pieces just like sales — never store stock in mixed units.
- Don't overwrite cost price silently; if it changes, record it (it affects profit history).

## Definition of done
Recording a purchase raises piece-stock correctly, increases the supplier balance by the unpaid amount, and the payables report and supplier statement reflect it immediately.
