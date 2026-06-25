---
name: pos-billing
description: The point-of-sale / billing screen for the wholesale shop app — scan items, choose unit and quantity, apply discount, pick a customer, and check out as cash, udhaar (credit), or mixed. Use this whenever you build or change the sales counter, cart, checkout, discounts, or invoice creation. Apply it for the whole billing flow so sales, stock, and customer balances always stay in sync.
---

# POS billing

Flow: `wholesale-shop-software-spec.md` Section 5 (#7); pricing in Section 9; ledger in udhaar-khata.

## The billing flow
1. Barcode field always focused (see barcode-scanning). Scan or search → item added.
2. Per line: choose **unit** (piece/dozen/carton), quantity, optional line discount. Price comes from that unit (wholesale vs retail by customer type).
3. Choose customer (required for udhaar; "walk-in" allowed for cash).
4. Payment mode: **Cash**, **Udhaar**, or **Mixed** (part cash now, rest to khata).
5. Complete → save sale atomically, deduct stock in pieces, write ledger for any credit, print receipt.

## Speed & UX (this screen is used all day)
- Big total, big pay buttons (design-system). Keyboard-friendly; minimal clicks.
- Scanned item slides in with a green check. Show running total live, updating with a subtle pop.
- Block completion if stock would go negative; warn clearly.
- Enforce the employee's discount cap (auth-and-rbac).

## Correctness
- One atomic write creates sale + items, stock deduction, and ledger entries (see supabase-data-layer). Never update stock or balance separately in the UI.
- Round all money through the shared helper. Cash + udhaar split must equal the total.

## Definition of done
A mixed cash/udhaar sale of multiple units saves once, reduces piece-stock correctly, raises the customer's balance by exactly the credit portion, prints a correct receipt, and respects the discount cap.
