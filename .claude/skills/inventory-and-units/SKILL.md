---
name: inventory-and-units
description: Products, categories, stock, and the wholesale multi-unit pricing model (carton / dozen / piece) for the shop app. Use this whenever you build product management, category trees, stock tracking, low-stock logic, or any place that sells/deducts/prices an item in different units. Apply it for ANY stock or pricing math so quantities and totals are always correct.
---

# Inventory & multi-unit pricing

Model and schema: `wholesale-shop-software-spec.md` Sections 5 & 9 (tables in Section 8).

## The unit model (the heart of wholesale)
- Each product's `base_unit` is **piece**. Stock is ALWAYS stored and reduced in pieces.
- `product_units` lists sellable units with a `factor` (pieces per unit): piece=1, dozen=12, carton=e.g.144 — and each unit has its OWN `wholesale_price` and `retail_price`.
- Selling `q` of a unit: deduct `q × factor` pieces; charge `q × that unit's price`.
- Display stock back in friendly units where helpful (e.g. "3 cartons + 5 pieces") but compute in pieces.

## Products & categories
- Fields per Section 8: `name_en`, `name_ur`, category, brand, barcode, cost_price, min_stock_level, optional expiry/batch.
- Categories support sub-categories (Makeup, Skincare, Perfumes, Soaps, Hair oil, Oils, Deodorants, Beauty tools…).
- Cost price is admin-only (see auth-and-rbac).

## Stock signals
- Low stock when on-hand ≤ `min_stock_level`; show amber (design-system).
- If `has_expiry`, track batch + expiry and warn on near-expiry (cosmetics expire).

## Gotchas
- Never let two unit rows disagree about factor; one product = one base unit.
- Returns add pieces back; purchases add pieces in (via their unit factor).
- Guard against negative stock; warn before overselling.

## Definition of done
Selling/returning in any unit keeps the piece-level stock exactly right, each unit prices correctly, and low-stock + (if used) expiry warnings fire.
