---
name: printing-receipts
description: Printing for the shop app — thermal sales receipts, A4/A5 invoices, customer/supplier statements, and barcode labels. Use this whenever you build or change anything that prints or generates a PDF: receipts after a sale, reprinting an invoice, a khata statement, or sticker labels. Apply it so printed output is correct, bilingual, and fits common Pakistani shop printers.
---

# Printing (receipts, invoices, statements, labels)

## Thermal receipt (80mm — most common)
- Header from settings: shop name/logo, address, phone, (tax no. if used). Footer message.
- Body: date/time, invoice no., cashier, customer (if any); item lines with unit + qty + price; subtotal, discount, tax, **total**; amount paid, and **balance/udhaar due** clearly if credit.
- Use a print-specific CSS layout (~80mm width, mono-ish, large total). Test actual printing, not just screen.

## Invoice (A4/A5) and statements
- Reprintable from any past sale. Customer statement = date-wise ledger with running balance (see udhaar-khata), printable and WhatsApp-shareable.
- Generate a PDF for sharing; keep numbers right-aligned with tabular figures.

## Labels
- Code128 product labels via `bwip-js` for unbranded stock (see barcode-scanning); lay out on standard sticker sheets.

## Bilingual
- Choose language at print time (see bilingual-urdu-rtl). Keep alignment consistent if mixing English/Urdu lines.

## Gotchas
- Round and format money with the shared helper; never print raw floats.
- Always show the outstanding balance on a credit sale so the customer sees what they owe.

## Definition of done
A real 80mm print of a credit sale shows correct items, total, paid, and remaining udhaar; an invoice/statement reprints accurately and shares as a clean PDF; labels scan back correctly.
