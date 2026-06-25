# Wholesale Shop Management Software — Design & Development Spec

**For:** A wholesale beauty/cosmetics shop in Pakistan (makeup, skincare, soaps, perfumes, deodorants, hair oil & other oils, hair care, beauty tools, etc.)
**Build method:** Vibe-coding with Claude Code
**Core requirements:** Works online **and** offline · accessible anywhere · Admin/Employee roles · Urdu support · Barcode scanning · Udhaar/Khata (customer credit)

---

## 0. How to use this document

Do **not** paste this whole file into Claude Code and say "build it." It will produce a broken half-app.

Instead, build in **phases** (Section 11). Each phase has a ready-to-paste prompt. Finish and test a phase before moving to the next. Keep this file open as your "source of truth" and refer Claude Code back to specific sections (e.g. "use the schema in Section 8").

---

## 1. Goals

1. Fast counter billing for wholesale (bulk) and retail customers.
2. Accurate stock — know exactly what's in the shop at any moment.
3. Udhaar/khata — track who owes you money and who you owe (suppliers).
4. Admin sees everything (cost, profit, settings, users). Employees are restricted (can bill and take payments, can't see cost/profit or change prices).
5. Keep working when the internet drops; sync when it comes back.
6. Usable in **Urdu and English**.

---

## 2. Recommended Tech Stack

Chosen to be (a) easy for Claude Code to build, (b) online + offline, (c) accessible from any device with a browser.

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + TypeScript + Vite** | Most reliable stack for Claude Code; fast |
| Styling/UI | **Tailwind CSS + shadcn/ui** | Clean components, quick to build, RTL-friendly |
| Data fetching/cache | **TanStack Query** | Caches data so reads work offline |
| Offline storage | **IndexedDB** (via TanStack Query persistence; upgrade to **RxDB/PowerSync** later) | Local data + offline write queue |
| Backend + DB + Auth | **Supabase** (hosted PostgreSQL + Auth + Row-Level Security) | "Access anywhere", built-in login + roles, no server to manage |
| Translations | **react-i18next** | English/Urdu toggle + RTL |
| Barcode (camera) | **@zxing/library** or **html5-qrcode** | Scan with phone/tablet camera |
| Barcode (USB scanner) | plain keyboard input | Cheap USB scanners type the code like a keyboard |
| Barcode labels | **bwip-js** (Code128) | Generate/print labels for products with no barcode |
| PWA / installable | **vite-plugin-pwa** | Install on desktop/phone, offline shell |
| Printing | browser print + thermal receipt CSS | Works with most receipt printers |
| Hosting | **Vercel** (frontend) + Supabase (backend) | Free tier is enough to start |

### Offline strategy (important, read this)
True two-way offline sync is the hardest part. Build it pragmatically:

- **v1 (do this first):** App is a PWA. With TanStack Query persistence, the app **loads and all reads work offline**. When the connection is back, it refreshes. New sales made offline are **queued** and pushed when online.
- **v2 (upgrade later):** If the shop is often fully offline for long periods, switch the local store to **RxDB** or add **PowerSync**, which give robust local-first sync. Only do this once v1 works — don't start here.

> If the shop has *one fixed billing counter PC* and rarely needs remote access, a simpler alternative is **Electron + local SQLite** (fully offline) with optional cloud backup. But since you want "access anywhere," the Supabase PWA path above is the better fit.

---

## 3. System Architecture

```
[ Browser / PWA on PC, laptop, phone, tablet ]
        |  (React app, works offline via IndexedDB cache)
        |
   online  <---- sync / queue ---->  offline
        |
[ Supabase ]
   ├── Auth (login, admin vs employee)
   ├── PostgreSQL (all data)
   └── Row-Level Security (enforces who can read/write what)
```

- One Supabase project = one shop (v1 is single-shop; schema leaves room for branches later).
- Roles are enforced **on the server** by Row-Level Security, not just hidden in the UI. This is what actually stops an employee from seeing cost/profit.

---

## 4. User Roles & Permissions

Two roles for v1: **Admin** and **Employee**.

| Capability | Admin | Employee |
|---|:---:|:---:|
| Login | ✅ | ✅ |
| Create/edit/delete products | ✅ | ❌ |
| See **cost price** & **profit** | ✅ | ❌ |
| Change selling prices | ✅ | ❌ |
| Billing / make a sale (POS) | ✅ | ✅ |
| Add/edit customers | ✅ | ✅ |
| Take customer payments (khata) | ✅ | ✅ |
| Give discount above set limit | ✅ | ❌ (capped) |
| Purchases / stock-in | ✅ | ❌ |
| Manage suppliers | ✅ | ❌ |
| Returns/refunds | ✅ | ✅ (own sales only) |
| Delete/void an invoice | ✅ | ❌ |
| Reports — sales | ✅ (all) | ✅ (own/day only) |
| Reports — profit, stock value | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Settings (tax, shop info, language default) | ✅ | ❌ |

Every important action is written to an **audit log** (who did what, when) so the admin can review employee activity.

---

## 5. Feature Modules

1. **Auth & Users** — login, create employees, assign role, activate/deactivate, reset password, set per-employee discount limit.
2. **Dashboard** — today's sales, cash vs udhaar, low-stock alerts, total receivables, top products. (Admin sees profit; employee sees only their own sales total.)
3. **Products & Inventory**
   - Categories (e.g. Makeup, Skincare, Perfumes, Soaps, Hair Oil, Oils, Deodorants, Beauty Tools) with optional sub-categories.
   - Product fields: name (EN + UR), category, brand, barcode, image (optional), base unit, units & conversions, cost price, wholesale price, retail price, min-stock alert level, optional expiry/batch.
   - Stock view with low-stock and (optionally) near-expiry highlights.
4. **Multi-unit & pricing** — sell the same product as **carton / dozen / piece** with auto price + stock conversion (see Section 9).
5. **Purchases (Stock-in)** — record stock bought from a supplier; updates stock and supplier balance; supports partial payment.
6. **Suppliers** — supplier list with running balance (what you owe them) and payment history.
7. **Sales / POS (billing)** — fast screen: scan barcode → item added → choose unit → quantity → discount → choose **Cash / Udhaar / Mixed** → print receipt. Pick customer (required for udhaar).
8. **Customers & Udhaar/Khata** — customer list with running balance, full ledger (every sale, every payment), per-customer statement, "take payment" button, WhatsApp/print statement.
9. **Returns** — sale return (stock back in, adjust balance) and purchase return.
10. **Reports** — daily/period sales, item-wise sales, stock report, stock value, profit (admin), receivables (who owes you), payables (who you owe), low stock, expiry.
11. **Settings** — shop name/logo/address/phone, tax/GST rate, currency (PKR), default language, receipt header/footer, backup/export.
12. **Barcode tools** — scan to find/add; generate & print barcode labels for unbranded bulk products.

---

## 6. Urdu / Bilingual Support

- Use **react-i18next** with two files: `en.json`, `ur.json`. Every label comes from translation keys, never hard-coded text.
- A language toggle in the top bar (English ⇄ اردو). Save choice per user.
- **RTL:** when Urdu is active, set `dir="rtl"` on the app root; Tailwind handles mirroring with logical classes (`ps-`, `pe-`, `ms-`, `me-`).
- **Urdu font:** load **Noto Nastaliq Urdu** (Google Fonts) for proper Nastaliq rendering.
- **Product names in both languages:** store `name_en` and `name_ur` so receipts/search work either way. Search should match both.
- Numbers/prices stay in Latin digits for clarity on invoices (configurable later).

---

## 7. Barcode Scanning

Support both common setups in Pakistani shops:

- **USB barcode scanner (cheapest, most common):** it behaves like a keyboard. The POS just needs a focused barcode field that captures a fast burst of characters ending in Enter, then looks up the product. No special driver.
- **Phone/tablet camera:** use `@zxing/library` or `html5-qrcode` for a "scan with camera" button.
- **Products with no barcode (loose/unbranded bulk):** generate an internal barcode (Code128) with `bwip-js` and print sticker labels. Each product can have one official barcode plus internal codes.
- On scan: if found → add to cart; if not found (admin) → quick "add new product with this barcode" flow.

---

## 8. Database Schema (PostgreSQL / Supabase)

Core tables and key columns. Let Claude Code generate the SQL migrations from this.

**users** (extends Supabase auth)
`id, full_name, username, role ('admin'|'employee'), discount_limit, is_active, created_at`

**categories**
`id, name_en, name_ur, parent_id (nullable, self-ref), sort_order`

**products**
`id, name_en, name_ur, category_id, brand, barcode (unique, nullable), image_url, base_unit ('piece'), cost_price, min_stock_level, has_expiry (bool), is_active, created_at`

**product_units** (multi-unit pricing — Section 9)
`id, product_id, unit_name ('piece'|'dozen'|'carton'|custom), factor (pieces per this unit), wholesale_price, retail_price, barcode (nullable)`

**stock**
`id, product_id, quantity_in_base_unit, batch_no (nullable), expiry_date (nullable), updated_at`
*(For v1 you can keep a single quantity per product; add batches later.)*

**suppliers**
`id, name, phone, address, opening_balance, current_balance, created_at`

**purchases**
`id, supplier_id, invoice_no, date, subtotal, discount, total, paid, due, note, created_by, created_at`

**purchase_items**
`id, purchase_id, product_id, unit_name, quantity, unit_cost, line_total`

**customers**
`id, name, phone, address, customer_type ('wholesale'|'retail'), opening_balance, current_balance, created_at`

**sales** (invoices)
`id, invoice_no, customer_id (nullable for walk-in), date, subtotal, discount, tax, total, paid, due, payment_type ('cash'|'udhaar'|'mixed'), created_by, is_void, created_at`

**sale_items**
`id, sale_id, product_id, unit_name, quantity, unit_price, line_total`

**customer_ledger** (the khata)
`id, customer_id, type ('opening'|'sale'|'payment'|'return'|'adjustment'), amount (+owe / -paid), ref_sale_id (nullable), date, note, created_by`

**supplier_ledger**
`id, supplier_id, type ('opening'|'purchase'|'payment'|'return'|'adjustment'), amount, ref_purchase_id (nullable), date, note, created_by`

**payments** (optional split-out, or use the ledger directly)
`id, party_type ('customer'|'supplier'), party_id, amount, method ('cash'|'bank'|'easypaisa'|'jazzcash'), date, created_by`

**settings** (single row)
`shop_name, logo_url, address, phone, tax_rate, currency ('PKR'), default_language ('ur'|'en'), receipt_header, receipt_footer`

**audit_log**
`id, user_id, action, entity, entity_id, details (jsonb), created_at`

**Rules / triggers to implement:**
- A sale updates `stock`, creates `customer_ledger` rows for any udhaar, and updates `customers.current_balance`.
- A payment inserts a `customer_ledger`/`payments` row and lowers the balance.
- A purchase updates `stock` and `suppliers.current_balance`.
- **Row-Level Security:** only admins can `select` cost/profit columns and write to products/purchases/settings/users. Employees can insert sales/payments/customers and read non-cost data.

---

## 9. Wholesale Units & Pricing (important for wholesale)

Wholesale shops buy in cartons but sell in cartons, dozens, or single pieces. Model it once and reuse everywhere.

- Each product has a `base_unit` = **piece**. Stock is always stored in pieces internally.
- `product_units` defines sellable units with a `factor` = how many pieces it contains:
  - piece → factor 1
  - dozen → factor 12
  - carton → factor (e.g.) 144
- Each unit row has its **own wholesale and retail price**.
- When billing: choose product → choose unit → quantity. The app deducts `quantity × factor` pieces from stock and uses that unit's price.
- This keeps stock accurate no matter which unit was sold, and lets you price bulk cheaper than singles.

---

## 10. Udhaar / Khata Design

- Every customer has a **running balance** (`current_balance`). Positive = they owe you.
- A credit ("udhaar") sale adds a `customer_ledger` row of type `sale` (+amount) and raises the balance.
- A payment adds type `payment` (−amount) and lowers it.
- "Mixed" payment at billing: part cash now, rest to khata.
- **Customer statement:** full date-wise ledger (sale, payment, balance running total), printable and shareable on WhatsApp.
- **Receivables report:** all customers with balance > 0, sorted by amount, with last payment date — so you know who to chase.
- Same pattern mirrored for **suppliers** (what *you* owe).

---

## 11. Build Roadmap — Phase-by-Phase Prompts for Claude Code

Build top to bottom. Test each phase before the next. Tell Claude Code to reference this spec.

### Phase 0 — Project setup
```
Set up a new project: React + TypeScript + Vite, Tailwind CSS, shadcn/ui,
TanStack Query, react-router, react-i18next (English + Urdu with RTL support),
and vite-plugin-pwa. Add Supabase client. Create a clean app layout with a
sidebar (Dashboard, Products, Sales/POS, Customers, Suppliers, Purchases,
Reports, Settings), a top bar with a language toggle (English/اردو) and the
logged-in user, and a login page. Load the Noto Nastaliq Urdu font and switch
to dir="rtl" when Urdu is active. No real data yet — just scaffolding and routing.
```

### Phase 1 — Auth & roles
```
Add Supabase email/password auth. Create a `users` table with role
('admin'|'employee'), discount_limit, is_active. After login, load the user's
role and store it in context. Add route guards: employees cannot open Products,
Purchases, Suppliers, Settings, Users, or profit reports. Add a Users admin page
(admin only) to create employees, set role, set discount limit, activate/deactivate.
Enable Row-Level Security so the rules are enforced on the server, not just hidden.
```

### Phase 2 — Products, categories, units (admin)
```
Using the schema in Section 8 of the spec, create tables and CRUD UIs for
categories (with name_en/name_ur and optional parent) and products
(name_en, name_ur, category, brand, barcode, image, cost_price, min_stock_level).
Add product_units so each product can be sold as piece/dozen/carton with a factor
and its own wholesale_price and retail_price (Section 9). Add a stock table and a
stock list page with low-stock highlighting. Hide cost_price from employees.
```

### Phase 3 — Suppliers & Purchases (admin)
```
Add suppliers (with running balance) and a Purchases (stock-in) flow: pick supplier,
add products with unit + quantity + unit cost, set paid amount. On save: increase
stock, create supplier_ledger rows, update supplier balance. Add a supplier list with
balances and a per-supplier ledger/statement.
```

### Phase 4 — Sales / POS with barcode
```
Build a fast POS billing screen: a barcode input that captures USB-scanner input
(fast keystrokes + Enter) and a "scan with camera" button using @zxing/library.
Scanning adds the product to the cart; choose unit, quantity, line discount. Pick a
customer (or walk-in). Choose payment: Cash / Udhaar / Mixed. On complete: save the
sale and sale_items, deduct stock (quantity × unit factor), and print a thermal-style
receipt with the shop header from settings. Enforce each employee's discount limit.
```

### Phase 5 — Customers & Udhaar/Khata
```
Add customers (wholesale/retail, opening balance, running balance). Implement the
khata per Section 10: credit sales raise the balance via customer_ledger; add a
"Take Payment" action (cash/bank/easypaisa/jazzcash) that lowers it. Build a
printable, WhatsApp-shareable customer statement and a Receivables report listing
everyone who owes money, sorted by amount with last payment date.
```

### Phase 6 — Reports & Dashboard
```
Build the dashboard (today's sales, cash vs udhaar, low stock, total receivables;
show profit only to admins). Add reports: sales by day/period, item-wise sales,
stock report, stock value, profit (admin only), receivables, payables, low stock,
near-expiry. Employees see only their own sales for today.
```

### Phase 7 — Offline / PWA + sync
```
Make the app a fully installable PWA. Add TanStack Query persistence to IndexedDB
so the app loads and all reads work offline. Queue sales/payments made while offline
and push them to Supabase when the connection returns, with a visible "offline /
syncing / synced" indicator. Handle invoice-number conflicts on sync.
```

### Phase 8 — Polish
```
Add Settings (shop name, logo, address, phone, tax rate, default language, receipt
header/footer), barcode label generation/printing with bwip-js (Code128) for products
with no barcode, an audit log of important actions, full Urdu translations and RTL
review of every screen, and data export/backup (CSV). Then deploy the frontend to
Vercel.
```

---

## 12. Deployment

- **Frontend:** push to GitHub → deploy on **Vercel** (free). Set Supabase URL + anon key as env vars.
- **Backend:** **Supabase** project (free tier to start). Keep daily DB backups on.
- **Custom domain (optional):** point a cheap `.pk`/`.com` domain at Vercel.
- Install the PWA on the shop's billing PC and on the owner's phone ("Add to Home Screen").

---

## 13. Hardware Checklist (shop side)

- Billing PC or laptop (any modern browser).
- **USB barcode scanner** (cheap, plug-and-play).
- **Thermal receipt printer** (80mm common in Pakistan) + optional **barcode label printer** for unbranded stock.
- Optional cash drawer.
- A phone/tablet for stock-taking or scanning with the camera.

---

## 14. Things to confirm before/while building

- Do you charge **GST/sales tax** on invoices, or are prices tax-inclusive? (Sets the tax field default.)
- Do you need **expiry/batch tracking** now, or add later? (Cosmetics do expire — recommended soon.)
- Payment methods to support: Cash, Bank, **Easypaisa**, **JazzCash**?
- Roughly how many products and customers? (Affects how soon you need the v2 offline upgrade.)

---

## 15. Later upgrades (not v1)

- Multiple branches (the schema already leaves room — add a `branch_id`).
- Robust offline-first sync via **RxDB** or **PowerSync**.
- WhatsApp Business API for sending statements/receipts automatically.
- Salesman/route accounts and commission.
- Mobile app wrapper (Capacitor) if you want it in the Play Store.

---

## 16. Design System (colors, type, motion)

**Concept:** Calm, premium, fast. One confident brand colour — deep emerald-teal — keeps the screen quiet during a busy day. A restrained gold accent nods to the beauty/cosmetics world without looking girly. Loud colour is reserved to *mean* something: green = cash/paid, red = udhaar/due, amber = low stock. Generous whitespace, big readable numbers, hairline borders. On the billing screen, the **total** and the **pay buttons** are the biggest things; everything else is quiet. Add this to your Phase 0 prompt: *"use the Design System in Section 16."*

### Colour tokens
| Role | Hex | Tint (light bg) | Use |
|---|---|---|---|
| Primary / brand | `#0E6E58` | `#E3F1EC` | Main buttons, active nav, links |
| Primary dark | `#0C4A3D` | — | Sidebar / top-bar background |
| Accent / gold | `#C99A3E` | `#F6ECD6` | Logo, small premium highlights (sparingly) |
| Page background | `#F6F7F5` | — | App background |
| Card / surface | `#FFFFFF` | — | Cards, panels, rows |
| Heading text | `#14211D` | — | Titles |
| Body text | `#3C4B46` | — | Normal text |
| Muted text | `#7C8A84` | — | Labels, hints |
| Success / Cash / Paid | `#15924F` | `#E7F4EC` | Cash payments, "paid" status |
| Danger / Udhaar / Due | `#D33A4F` | `#FBEAEC` | Credit owed, alerts |
| Warning / Low stock | `#E08A1E` | `#FBEFD9` | Low-stock, near-expiry |
| Info | `#2D74C8` | `#E9F1FB` | Neutral info |
| Border / divider | `#E6E9E6` | — | Hairlines |

Dark mode (optional, add later): surfaces → `#0F1614` / `#14201C`, body text → `#E8EFEC`, keep the same accent and semantic hues slightly brightened.

### Typography
- UI + numbers: **Inter**, with `font-feature-settings: "tnum"` so prices and columns align.
- Urdu: **Noto Nastaliq Urdu** for receipts and headings. For dense Urdu tables, **Noto Sans Arabic** is more legible at small sizes — offer both and let the shop choose.
- Sizes: page title 20px · section 16px · body 14px · labels 12–13px · big totals 28–32px. Weights 400 + 600 only. **Sentence case everywhere** (never ALL CAPS).

### Spacing, shape, feel
- Generous padding; minimum touch target 44px (fast clicks at the counter).
- Corner radius 10–12px on cards/buttons, 8px on inputs.
- Hairline borders; avoid heavy shadows (one soft shadow only on raised menus/dropdowns).
- Strong hierarchy: the total and the pay actions dominate the billing screen.

### Motion (subtle — 150–250ms)
- Sections: fade + 8px slide-up on load.
- Scanned item: row slides in from the top with a green check and a brief teal left-edge highlight.
- Totals: quick scale "pop" when the value changes.
- Buttons: 150ms hover; `scale(0.98)` on press.
- Toasts: slide in from the top-right, auto-dismiss ("Sale saved").
- Completed sale: a one-shot success-check animation, then the cart resets.
- Lists: skeleton shimmer while loading, not spinners.
- Always honour `prefers-reduced-motion` and disable non-essential motion.
- Library: **Framer Motion** for component motion; Tailwind transitions for hovers.

### Tailwind theme snippet (paste into Claude Code)
```js
// tailwind.config.js → theme.extend.colors
colors: {
  brand:   { DEFAULT: '#0E6E58', dark: '#0C4A3D', soft: '#E3F1EC' },
  accent:  { DEFAULT: '#C99A3E', soft: '#F6ECD6' },
  page:    '#F6F7F5',
  surface: '#FFFFFF',
  ink:     { DEFAULT: '#14211D', body: '#3C4B46', muted: '#7C8A84' },
  cash:    { DEFAULT: '#15924F', soft: '#E7F4EC' },
  due:     { DEFAULT: '#D33A4F', soft: '#FBEAEC' },
  low:     { DEFAULT: '#E08A1E', soft: '#FBEFD9' },
  info:    { DEFAULT: '#2D74C8', soft: '#E9F1FB' },
  line:    '#E6E9E6',
}
```

---

*Build it phase by phase, test as you go, and point Claude Code back to the relevant section whenever it drifts. Good luck.*
