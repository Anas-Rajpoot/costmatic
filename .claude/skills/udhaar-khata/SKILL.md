---
name: udhaar-khata
description: Customer and supplier credit (udhaar / khata) for the shop app — running balances, ledgers, payments, statements, and receivables/payables. Use this whenever you touch who-owes-what: credit sales, taking payments, opening balances, customer or supplier statements, or "how much does X owe". Apply it for ANY balance change so the ledger and the running balance never disagree.
---

# Udhaar / khata (credit ledgers)

Design: `wholesale-shop-software-spec.md` Section 10 (mirrors for suppliers).

## The ledger model
- Each customer has a running `current_balance` (positive = they owe you). Suppliers mirror this (what you owe).
- Every change is a `customer_ledger` (or `supplier_ledger`) row: `opening | sale | payment | return | adjustment`, with a signed amount and a date.
- Credit sale → `sale` (+). Payment → `payment` (−). Sale return → `return` (−). The running balance is derived from the ledger, and `current_balance` is kept in step inside the same transaction.

## Must-haves
- **Take payment** action: method (cash/bank/easypaisa/jazzcash), amount, date, optional note → lowers balance.
- **Customer statement:** date-wise ledger with a running balance, printable and shareable on WhatsApp (see printing-receipts).
- **Receivables report:** everyone with balance > 0, sorted by amount, with last-payment date, so the owner knows who to chase. Payables = the supplier equivalent.

## Gotchas
- Never edit `current_balance` directly without a matching ledger row — that's how books drift. Always go ledger-first.
- Opening balances are a ledger row of type `opening`, not a silent column edit.
- Mixed-payment sales post only the credit portion to the ledger.
- Round consistently; show "owes" vs "advance/credit" clearly when balance is negative.

## Definition of done
After any sale, payment, or return, the statement's running total equals `current_balance`, the receivables list updates, and every change is traceable to a ledger row.
