---
name: barcode-scanning
description: Barcode scanning and label printing for the shop app — USB scanners, phone/tablet camera scanning, and generating Code128 labels for unbranded bulk stock. Use this whenever you build product lookup-by-scan, the POS scan field, "add product by barcode", or print barcode stickers. Apply it any time a barcode is read or created so both hardware and camera paths work.
---

# Barcode scanning & labels

Approach: `wholesale-shop-software-spec.md` Section 7.

## Two scan paths (support both)
1. **USB scanner (most common, cheapest):** it types the code like a keyboard then sends Enter. The POS needs a focused, always-ready barcode field that captures a fast keystroke burst ending in Enter, looks up the product, adds it, and clears for the next scan. No driver needed.
2. **Camera (phone/tablet):** a "scan" button using `@zxing/library` or `html5-qrcode`; on decode, same add-to-cart path.

## Lookup behaviour
- On scan: match `products.barcode` or any `product_units.barcode`. Found → add to cart. Not found → if admin, offer "create product with this barcode"; if employee, show a clear "not found" message.
- Debounce so one physical scan never adds the item twice.

## Labels for unbranded stock
- Generate internal barcodes (Code128) with `bwip-js` and print sticker sheets for loose/bulk products that have no barcode.
- A product can have one official barcode plus internal codes.

## Gotchas
- Keep the scan field focused during billing; restore focus after dialogs.
- Validate/normalise scanned strings (trim, ignore empty/garbage reads).

## Definition of done
A USB scan and a camera scan both add the right product instantly, duplicates are prevented, unknown codes are handled per role, and you can print a readable Code128 label.
