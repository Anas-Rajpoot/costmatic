# Costmatic — Kiryana Store Expansion Plan

> **Status:** Draft for review. **No code yet.** Ye document review ke liye hai — approve
> karne ke baad phase-wise implementation shuru hogi.
> **Scope:** Ye ek independent folder-copy hai. Do live clients (alag Supabase DBs) is se
> bilkul untouched rahenge. Yahan schema divergence acceptable hai.

---

## 0. TL;DR — Ek Line Mein Faisla

Aapki proposed direction (`product_variants` naya table) **theek soch hai lekin zaroorat se
zyada rewrite** maangti hai. Reason: aapka maujooda `product_units` table **pehle se hi ek
variant table hai** — usme `factor` + `retail_price` + `wholesale_price` per-unit already
mojood hain.

- **Category 2 (packaged fixed-size)** → **already fully works.** Koi change nahi.
- **Category 3 (beverages: bottle → crate)** → **already works** maujooda model pe. Sirf
  data-entry convention + chhoti UI polish chahiye. Koi structural schema change nahi.
- **Category 1 (loose/weight items)** → **yahi asli gap hai.** Iske liye 3 integer columns
  ko `numeric` karna padega + `create_sale` RPC ko "sell by amount" mode dena padega.

**Recommendation:** Naya `product_variants` table **mat banao**. Existing
`products` + `product_units` + `stock` ko **extend** karo. Isse working `create_sale`,
purchases, reports, offline-queue sab intact rehte hain — sirf surgical changes.

Baaki sab (keyboard POS, cash/change, multi-tab parked sales) **pure frontend** hai —
database ko haath lagaye baghair ho jaata hai.

---

## 1. Current Schema Analysis — Kya Reuse Hoga, Kya Badlega

### 1.1 Maujooda relevant tables (baseline `0001` + hardening `0002`)

```
products
  id, name_en, name_ur, category_id, brand, barcode (unique),
  base_unit  text   default 'piece'      ← har product ka base unit
  min_stock_level int, has_expiry, is_active
  (cost_price yahan se HATA diya gaya — ab product_costs table me hai, admin-only RLS)

product_units                            ← YE PEHLE SE VARIANT TABLE HAI
  id, product_id,
  unit_name  text                        ← 'piece' | 'dozen' | 'carton' | 'crate' ...
  factor     integer  CHECK (factor > 0) ← 1 unit = factor × base units
  wholesale_price numeric(12,2)
  retail_price    numeric(12,2)
  barcode    text (nullable)             ← per-unit barcode (packaged sizes ke liye)

stock
  product_id (unique), quantity_in_base_unit integer, batch_no, expiry_date

sale_items
  sale_id, product_id, unit_name text,
  quantity integer CHECK (quantity > 0),
  unit_price, discount_pct, line_total

create_sale(...)  SECURITY DEFINER RPC
  - server-authoritative: har price/factor CATALOG se lookup karta hai
  - client-supplied prices ignore hoti hain
  - stock base-units me check + deduct hota hai
  - discount cap server-side enforce
```

### 1.2 Har category current model pe map karke

| Category | Kaise map hota hai | Kaam karta hai? |
|---|---|---|
| **2. Packaged (shampoo 200ml/400ml)** | Har size = alag `product`, ek `piece` unit, fixed price | ✅ **Already 100%** |
| **3. Beverage (Coke bottle→crate)** | Har size = alag `product`; base unit = **bottle**; `crate` = ek `product_unit` with `factor = bottles-per-crate`; retail = per-bottle price, wholesale = per-crate price | ✅ **Already works** — sirf achhi data-entry chahiye |
| **4. Cigarette (pack/dabi→carton)** — *NEW* | Beverage jaisa hi: base unit = **pack** (dabi, 20 sticks); `carton` = `product_unit` `factor = 10` (packs per carton). Retail = per-pack, wholesale = per-carton | ✅ **Same model as beverage** — bas retail/wholesale eligibility flag chahiye (§2.7) |
| **1. Loose (cheeni/dal per-kg)** | ❌ `factor`, `quantity`, `stock` sab **INTEGER** hain → 0.35 kg / Rs 200-worth represent nahi ho sakta | ❌ **Yahi break hota hai** |

> **§1.2 addendum (NEW rule — see §2.7):** RETAIL mode me hamesha **sabse chhoti sellable unit** bikni chahiye
> (cigarette = 1 pack, beverage = 1 bottle, loose = chhoti weight); WHOLESALE me hamesha **bulk unit** (cigarette
> = carton, beverage = crate, loose = bulk bag with per-product minimum). Cigarette structurally beverage ke
> barabar hai — koi naya schema constraint nahi, sirf **eligibility flags + loose wholesale-minimum** add hote hain.

### 1.3 Teen blocking constraints (sirf yehi asal problem hain)

1. `product_units.factor` **integer** — 250g pack ko `factor = 0.25` (jab base = kg) store nahi kar sakte.
2. `sale_items.quantity` **integer CHECK > 0** — 0.35 kg bech nahi sakte.
3. `stock.quantity_in_base_unit` **integer** — 12.5 kg stock rakh nahi sakte.

Baaki poora `create_sale` server-authoritative flow **theek hai aur reuse hoga** — bas usme
loose/amount logic add karna hai.

---

## 2. Proposed Database Schema

> Design principle: **extend, don't replace.** Counted goods (piece/bottle/carton) exactly
> jaise chal rahe hain waise hi chalein; loose goods ke liye numeric + do naye modes.

### 2.1 `products` par naye columns

```sql
alter table products
  add column product_kind text not null default 'standard'
    check (product_kind in ('standard','loose'));
  -- 'standard' = counted goods (piece / packaged / beverage bottle+crate) → integer qty
  -- 'loose'    = weight/volume goods (cheeni, dal, ghee) → fractional qty allowed
```

> **Note:** Beverage ke liye alag `kind` ki zaroorat nahi — wo `standard` hi hai jisme ek
> `crate` unit hota hai. `product_kind` sirf POS ko batata hai ke **fractional qty aur
> by-amount input** allow karna hai ya nahi.

`base_unit` ki convention (already column mojood hai, sirf values standardize karni hain):

| product_kind | base_unit | Misal |
|---|---|---|
| standard (piece) | `piece` | soap, shampoo |
| standard (beverage) | `bottle` | Coke 500ml |
| loose (weight) | `kg` | cheeni, atta, dal |
| loose (volume) | `litre` | khula ghee/oil |

### 2.2 Numeric conversion (teen columns) — **core change**

```sql
-- Widening conversion — purana integer data safe upcast ho jaata hai
alter table product_units alter column factor type numeric(12,3);
alter table product_units drop constraint if exists product_units_factor_check;
alter table product_units add  constraint product_units_factor_check check (factor > 0);

alter table sale_items alter column quantity type numeric(12,3);
alter table sale_items drop constraint if exists sale_items_quantity_check;
alter table sale_items add  constraint sale_items_quantity_check check (quantity > 0);

alter table stock alter column quantity_in_base_unit type numeric(12,3);
-- purchase_items.quantity bhi numeric (stock-in bhi weight me ho sakta hai)
alter table purchase_items alter column quantity type numeric(12,3);
```

**App-level guard:** `product_kind = 'standard'` products ke liye UI/RPC integer qty enforce
karega (0.5 piece nahi bikta). `numeric(12,3)` sirf loose ke liye fractional allow karta hai.
`.3` decimals = 1 gram precision jab base unit kg ho (0.001 kg = 1 g). Volume ke liye bhi
1 ml precision.

### 2.3 Loose items ka pricing — `product_units` hi use hoga (naya table nahi)

Loose product ke `product_units` rows aese banenge. **Price hamesha PER-UNIT hai** (jaise
dozen/carton ka price hota hai, per-base nahi) — `line_total = price × qty`, `stock -= qty × factor`.
Isliye packs ko **independent/bulk pricing** di ja sakti hai:

| unit_name | factor | retail_price | wholesale_price | Matlab |
|---|---|---|---|---|
| `kg`   | 1.000 | 250  | 235  | base / custom-weight unit (per-kg rate) |
| `250g` | 0.250 | 65   | 60   | pack — apna price (per-kg se thoda upar bhi ho sakta) |
| `500g` | 0.500 | 125  | 118  | pack |
| `5kg`  | 5.000 | 1150 | 1100 | bulk bag — thok rate (per-kg se sasta) |

- **Fixed pack** ("1kg cheeni do") → user `500g`/`5kg` jaisa pack unit chunta hai, qty = 1 → `line = price × 1`.
- **Custom weight** ("0.35 kg do") → unit = `kg` (factor 1), qty = **0.350** → `line = 250 × 0.35`.
- **Custom amount** ("Rs 200 ki do") → server reverse-calc: `qty = round(200 / rate, 3)`,
  `line_total = 200` (exact). Unit = `kg`. (§6)

> **Addition 1 (confirmed):** Har unit ke paas `retail_price` **aur** `wholesale_price` dono
> hote hain (already columns mojood). `create_sale` v3 sale mode (retail/wholesale) ke hisab se
> sahi column pick karta hai — **amount-mode me bhi**. Yani wholesale customer ke liye "Rs 200 ki
> cheeni" ka weight `200 / wholesale_per_kg` se nikalta hai. Ye server-side hota hai, client se nahi.

> **Faida:** Predefined packs bhi wahi `product_units` mechanism use karte hain jo dozen/carton
> use karta hai. Koi naya join, naya RLS, naya migration path nahi. `create_sale` ka factor-lookup
> loop as-is kaam karta hai (sirf numeric ho jaata hai).

### 2.4 Optional: pack presets ko normalize karna (nice-to-have, zaroori nahi)

Agar har loose product pe wahi 250/500/750/1000/2000/5000 packs repeat honge, to unhein
per-product `product_units` me duplicate karne ke bajaye ek chhota lookup rakh sakte hain:

```sql
-- OPTIONAL — sirf agar data-entry bojh zyada lage
create table loose_pack_presets (
  id uuid primary key default gen_random_uuid(),
  label_en text, label_ur text,
  grams numeric(12,3) not null,     -- 250, 500, 1000 ...
  sort_order int default 0
);
```

POS in presets ko "quick pack buttons" ki tarah dikhaega; actual sale phir bhi `kg` unit +
fractional qty (grams/1000) ke roop me jaati hai. **Phase 1 me ye skip** kar sakte ho —
seedha per-product units kaafi hain.

### 2.5 Beverages — koi schema change nahi, sirf convention

- 500ml Coke = product, `base_unit = 'bottle'`.
- Units: `bottle` (factor 1, retail = per-bottle), `crate` (factor 24, wholesale = per-crate).
- Broken case (5 bottles bikna) automatically chalta hai — stock bottles me hai.
- "units_per_case brand/size ke hisab se alag" → bas har product ke crate unit ka `factor`
  alag set kar do. Constant nahi, per-product hai — already supported.

**UI nicety (frontend only):** jab customer_type/mode = wholesale ho, POS default unit
`crate` pe set kar de; retail pe `bottle`. Ye §4 me cover hai.

### 2.5b Cigarettes (NEW) — bhi koi schema constraint change nahi, beverage jaisa

Cigarette structurally beverage ke barabar hai — sirf naam aur factor alag:

- Har brand+variant = alag `product`, `base_unit = 'pack'` (dabi = 20 sticks).
- Units: `pack` (factor 1, **retail** = per-pack), `carton` (factor 10, **wholesale** = per-carton).
- Stock hamesha packs me. Broken carton (carton khareed ke packs bechna) automatically chalta hai —
  stock packs me hai, `carton` sale = `10 × pack` deduct.
- "10 packs per carton" mostly constant hai lekin per-product `factor` set ho sakta hai (kuch brands 20/carton).
- `has_expiry = false` (cigarettes ko expiry/batch tracking ki zaroorat nahi).

| unit_name | factor (packs) | retail_price | wholesale_price | retail_eligible | wholesale_eligible |
|---|---|---|---|---|---|
| `pack`   | 1  | 300 | 0    | ✅ true  | ❌ false |
| `carton` | 10 | 0   | 2850 | ❌ false | ✅ true  |

> **Farq beverage se:** yahan **strict eligibility** chahiye — retail me **sirf pack**, wholesale me **sirf carton**
> (single pack wholesale rate pe nahi, poora carton retail me nahi). Ye §2.7 ke flags se enforce hota hai,
> aur server-side bhi (§6.4). Beverage pe bhi ab yehi strict rule apply hoga (retail=bottle only, wholesale=crate only).

### 2.6 Sale header pe cash-tendered (chhota add, optional)

Change-due audit ke liye:

```sql
alter table sales
  add column tendered numeric(12,2),   -- customer ne kitna cash diya
  add column change_due numeric(12,2); -- wapas kitna diya
```

Ye sirf record-keeping hai; `create_sale` isse `paid`/`due` derive nahi karta (wo pehle jaisa
authoritative rehta hai). Optional — Phase B me aa sakta hai.

### 2.7 Retail / Wholesale eligibility flags (NEW — general rule, sab categories pe)

**Rule:** RETAIL mode me sirf sabse chhoti sellable unit; WHOLESALE me sirf bulk unit. Isko per-unit
**flags** se model karte hain (koi naya table nahi — `product_units` par do boolean columns):

```sql
alter table product_units
  add column retail_eligible    boolean not null default true,
  add column wholesale_eligible boolean not null default true;
```

- **Default dono `true`** → **backward compatible**: purani beauty/standard products bilkul jaise
  chal rahe hain (har unit dono modes me bikta hai). Enforcement sirf tab hota hai jab shopkeeper
  kisi unit ka flag `false` kare.
- Per-category typical config:

| Category | Retail-only unit | Wholesale-only unit | Dono (flexible) |
|---|---|---|---|
| **Cigarette** | `pack` (wholesale=false) | `carton` (retail=false) | — |
| **Beverage** | `bottle` (wholesale=false) | `crate` (retail=false) | — |
| **Loose** | `kg` base + packs (retail=true) | `kg` base (wholesale=true, **+ min qty §2.8**) | `kg` base dono, packs usually retail-only |
| **Standard packaged** | — | — | `piece` (dono true — koi restriction nahi, default) |

> **Kyun per-unit, per-product nahi:** ek hi product ke alag units alag eligibility rakhte hain
> (pack vs carton). Isliye flag `product_units` par hai, `products` par nahi. `create_sale` ka
> maujooda per-item loop pehle se har unit ko catalog se lookup karta hai — bas wahin flag bhi
> padh lega (§6.4). Koi naya join nahi.

### 2.8 Loose items ka per-product WHOLESALE minimum (NEW)

Loose ka base unit (`kg`) dono modes me bikta hai, lekin wholesale me ek **minimum bulk quantity**
enforce hoti hai (cheeni ka gatta kam-se-kam 20kg). Ye **per-product** hai:

```sql
alter table products
  add column wholesale_min_qty numeric(12,3);   -- base units (kg/L); null = koi minimum nahi
```

- Sirf `product_kind = 'loose'` + `sale_type = 'wholesale'` pe apply hota hai.
- **Weight mode:** entered weight `< wholesale_min_qty` → reject.
- **Amount mode:** derived weight (`amount / wholesale_rate`) `< wholesale_min_qty` → reject.
- Retail mode me ye minimum apply **nahi** hota (chhoti weight/amount allowed).
- `null` = us product pe koi wholesale minimum nahi.

> Cheeni example: `wholesale_min_qty = 20`. Wholesale me "5 kg" ya "Rs 1000 (~4.25 kg)" → reject
> ("Wholesale minimum 20 kg"). Retail me 0.35 kg bilkul theek.

### 2.9 Admin/manager override (NEW — exception handling)

Special customer ke liye shop kabhi broken-case ya below-minimum wholesale de sakti hai. Iske liye
**admin-only override**:

- `create_sale` me naya param `p_allow_override boolean default false`.
- Override sirf tab honor hota hai jab **caller admin ho** (`role = 'admin'`) — employee ka override
  ignore. Server-side check, client flag pe bharosa nahi.
- Override true (aur admin) → eligibility (§2.7) aur loose-minimum (§2.8) checks **skip**.
- POS me override toggle **sirf admin ko** dikhta hai; har sale pe explicit on karna padta hai
  (default off), taake galti se bypass na ho.

---

## 3. Migration Strategy

**Existing data:** dono deployed clients ka data beauty/cosmetics hai — sab `standard`,
sab integer qty. Is copy me jo bhi seed/test data hai wo bhi standard hai.

**Steps (single migration file `0006_kiryana_catalog.sql`):**

1. `products.product_kind` add — `default 'standard'` → **saari purani rows automatically
   `standard`**, koi backfill nahi chahiye.
2. Numeric widening (§2.2) — integer→numeric **lossless upcast**, purana data as-is. Constraints
   drop+recreate.
3. (Optional) `loose_pack_presets` seed, `sales.tendered/change_due` add.
4. `create_sale` RPC ko replace karo (naya loose/amount logic — §6). Purana signature
   `drop function` karke naya banao (jaise `0005` me hua tha).
5. Cache buster bump: `main.tsx` me `buster` string ko `costmatic-YYYY-MM-DD` naye date pe
   set karo (CLAUDE.md rule) — kyunki cached product/sale shape badla.
6. TypeScript types (`src/types/index.ts`): `factor`/`quantity`/`quantity_in_base_unit` ab
   bhi `number` hi hain (TS me farq nahi), lekin `product_kind` field add hoga.

**Rollback safety:** numeric→integer wapas jaana loss-y hai, isliye migration se pehle staging
Supabase pe test (CLAUDE.md deployment rule). Production se pehle staging par apply.

**Reversibility:** `product_kind` aur naye columns nullable/defaulted hain, purana code inhein
ignore kar ke chal sakta hai — yani migration backward-compatible hai agar rollback lage.

---

## 4. POS UI/UX Flow

### 4.1 Har category cashier screen pe kaise dikhe

**Standard (piece/packaged):** bilkul jaise abhi hai — scan/search → cart line, qty +/−,
unit dropdown agar multiple units.

**Beverage:** same as standard, lekin cart line pe unit dropdown me `bottle` / `crate`.
Mode = wholesale → naya line default `crate`; retail → `bottle`. Cashier override kar sakta hai.

**Loose (weight):** jab loose product add ho, cart line ek **special input control** dikhaega
teen modes ke saath (segmented toggle):

```
┌─────────────────────────────────────────────────────────┐
│  Cheeni (چینی)              Rate: Rs 250 / kg            │
│  ┌────────┬────────┬────────┐                            │
│  │ Pack ▾ │ Weight │ Amount │   ← input mode toggle      │
│  └────────┴────────┴────────┘                            │
│                                                          │
│  [Pack]   : [250g][500g][1kg][2kg][5kg]  ← quick buttons │
│  [Weight] : [ 0.350 ] kg    → line = Rs 87.50            │
│  [Amount] : [ 200 ] Rs      → 0.800 kg  → Rs 200.00      │
│                                                          │
│  Line total: Rs 200.00                        [🗑]       │
└─────────────────────────────────────────────────────────┘
```

- **Pack mode:** quick buttons (product_units jinka factor < 1 ya predefined). Click = qty 1 of that unit.
- **Weight mode:** numeric field (kg), 3-decimal. Line = `weight × rate`.
- **Amount mode:** numeric field (Rs). Client **preview** ke liye `weight = amount / rate`
  dikhaata hai, magar **authoritative calc server pe** hoti hai (§6). Server rounding se
  chhota farak ho sakta hai — preview pe "approx" chip.

Weighing scale integration (optional, later): agar shop me serial/USB weighing scale hai to
weight field usse auto-fill ho sakti hai — abhi manual entry.

### 4.2 Multi-Tab / Parked Sales flow

```
┌─ Sale 1 ─┬─ Sale 2 •─┬─ + New ──────────────────────────┐  ← tab bar (badge = item count)
│                                                          │
│   (active sale ka poora cart/customer/payment state)     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Har tab ka **apna independent state**: `cart[]`, `customer`, `saleMode`, `paymentType`,
  `cashAmount`. Ek object `ParkedSale { id, label, cart, customer_id, saleMode, payment..., updated_at }`.
- **Persist** to IndexedDB (idb-keyval, existing offline pattern) under key
  `costmatic_parked_sales` — accidental refresh pe data safe. (Offline queue jaisa hi pattern.)
- New Sale = naya tab. Complete/Cancel = tab band, us tab ka parked state delete.
- **Max ~5 open tabs** (UI clutter guard). Zyada pe warning.
- **Stock reservation:** recommendation = **koi reservation nahi** (§7 me detail). Do parked
  sales same product hold kar sakti hain; oversell tab hi pakda jaata hai jab dusri sale
  actually checkout ho — server reject kar dega. Simpler + honest.

### 4.3 Cash tendered / Change UI

Payment section me jab `cash` ya `mixed`:

```
  Total:            Rs 1,240
  ┌──────────────────────────────┐
  │  Received (F4)                │
  │  [   2,000   ]                │   ← Amount Received field
  └──────────────────────────────┘
  Quick: [500] [1000] [2000] [5000] [Exact ✓]   ← common notes + exact-fill

  ╔══════════════════════════════╗
  ║  CHANGE DUE     Rs 760        ║   ← bada, clear font, cash-green
  ╚══════════════════════════════╝
```

- "Received" field. `change = received − total` (agar received ≥ total).
- Quick-amount buttons: 500/1000/5000 (settings se configurable, default common notes).
- **Exact (✓)** button / shortcut → received = total, change = 0.
- Agar `received < total` aur customer hai → remainder udhaar (existing mixed logic).
- Change bade font me (design-system: `cash` green).

### 4.4 Retail/Wholesale eligibility enforcement in POS (NEW)

UI **convenience layer** hai — asli enforcement server pe (§6.4). Cashier ki galti rokne ke liye:

**Unit selection filter by mode:**
- **Retail mode:** cart line ka unit-dropdown / mode-toggle sirf `retail_eligible = true` units dikhaye.
  - Cigarette → sirf `pack` (carton hidden).
  - Beverage → sirf `bottle` (crate hidden).
  - Loose → Weight/Amount/Pack sab available (packs retail-eligible).
- **Wholesale mode:** sirf `wholesale_eligible = true` units.
  - Cigarette → sirf `carton`.
  - Beverage → sirf `crate`.
  - Loose → Weight/Amount (base kg), **"min 20 kg" hint** dikhe; pack buttons (agar wholesale-ineligible) hidden.

**Mode switch pe auto-fix:** agar mode badalne se kisi cart line ka current unit us mode me ineligible ho
jaye, POS us line ko us mode ki **default eligible unit** pe auto-switch kar de (cigarette: carton⇄pack)
aur ek chhota inline note dikhaye ("Wholesale: carton"). Agar koi eligible unit hi na ho, line ko flag kare.

**Loose wholesale minimum (client preview):**
- Weight/Amount field ke neeche `min 20 kg` hint.
- Entered/derived qty `< min` → line red highlight + Complete Sale disabled (ya warning), jab tak
  qty ≥ min na ho ya admin override on na ho.

**Admin override toggle:**
- Payment area me chhota **"Override limits" checkbox — sirf admin ko dikhta hai** (employee ko nahi).
- On karne pe eligibility + loose-min client checks bypass, aur `p_allow_override = true` server ko jaata hai.
- Har sale ke baad default off (persistent nahi) — accidental bypass se bachne ke liye.

```
┌─ Wholesale ─────────────────────────────┐
│  Cigarette: [ Carton ▾ ]  Qty [ 2 ]     │  ← retail 'pack' option hidden
│  Cheeni:    Weight [ 25 ] kg            │
│             min 20 kg ✓                  │
│  ☐ Override limits (admin)               │  ← admin-only
└─────────────────────────────────────────┘
```

---

## 5. Complete Keyboard Shortcut Map

Design goals: har action ≤1 key; conflicts na hon; browser defaults (Ctrl+T/W/N) avoid; har
shortcut on-screen **chhota hint chip** dikhaye (naye cashier ke liye discoverability).

| Key | Action | Context |
|---|---|---|
| **type + Enter** | Barcode/search field me type karke Enter → item add (dedicated lookup key ki zaroorat nahi) | Global (field auto-focused) |
| **F2** | Search field pe focus wapas (agar mouse chala gaya) | Global |
| **F3** | Customer selector kholo | Global |
| **F4** | Payment → "Amount Received" field pe focus | Global |
| **F6** | Retail ⇄ Wholesale mode toggle | Global |
| **F9** / **Ctrl+Enter** | Complete Sale (checkout) | Global |
| **Enter** (payment focused) | Confirm/checkout | Payment section |
| **\*** (Exact) | Received = exact total | Payment |
| **Esc** | Close dropdown/modal; ya current field clear | Global |
| **Page Down / Page Up** | Sections ke beech cycle: Customer → Items → Payment → wapas | Global |
| **Alt+N** | New parked sale (naya tab) | Global |
| **Alt+1..5** | Sale tab 1..5 pe switch | Global |
| **Alt+H** | Hold (current sale park karo, cart clear without deleting) | Global |
| **Alt+C** | Cancel current sale (confirm) | Global |
| **↑ / ↓** | Cart lines / suggestion list navigate | List focused |
| **+ / −** | Selected cart line qty ++/−− | Cart line focused |
| **Del** | Selected cart line remove | Cart line focused |
| **q** then type | Selected line qty edit (absolute) | Cart line focused |
| **d** then type | Selected line discount edit (cap enforced) | Cart line focused |
| **F1** | Shortcut help overlay (poora map) | Global |

**Conflict notes:**
- Ctrl+T/N/W (browser tab/window) **use nahi karenge** — isliye `Alt+*` parked sales ke liye.
- Function keys (F2/F3/F4/F6/F9) primary actions ke liye — mostly browser-free (F1/F5/F11/F12 avoid, sirf F1 help ke liye `preventDefault` ke saath).
- Single-letter (q/d) sirf tab koi text field focused **na** ho — warna wo type ho jayenge.
  Implementation: global keydown handler jo `document.activeElement` check kare.

**Discoverability:** har button ke corner pe chhota `kbd` chip (jaise `F9`), aur F1 pe full-screen
cheat sheet. Bilingual (en/ur) labels.

---

## 6. Pricing / Stock Logic — Server-Authoritative (`create_sale` v3)

Maujooda `create_sale` (migration `0005`) pehle se authoritative hai: prices catalog se, discount
cap server-side, totals recompute. Ye pattern **rakhna** hai — bas do cheezein add karni hain:

### 6.1 Item payload me naya optional field

Har item ab ye bhej sakta hai:
```jsonc
{
  "product_id": "...",
  "unit_name": "kg",
  "input_mode": "qty" | "amount",   // NAYA — default "qty" (backward compatible)
  "quantity": 0.35,                 // qty mode me use hota hai (numeric ab)
  "amount": 200                     // amount mode me use hota hai (Rs)
}
```

### 6.2 Server-side loop (pseudocode)

```
for each item:
    (factor, list_price) := lookup product_units by (product_id, unit_name)   -- catalog only
    if item.input_mode = 'amount':
        -- reverse calc AUTHORITATIVELY server pe
        effective_rate := list_price               -- per-unit (per kg jab unit=kg)
        raw_qty := item.amount / effective_rate
        qty := round(raw_qty, 3)                    -- 1g/1ml precision
    else:
        qty := item.quantity
        if product.product_kind = 'standard' and qty <> floor(qty):
            raise 'Counted product needs whole quantity'
    -- discount cap (existing)
    enforce discount ≤ caller's limit
    unit_price := round(list_price * (1 - disc/100), 2)
    line_total := round(unit_price * qty, 2)
    -- stock check in BASE units (existing, ab numeric)
    need := qty * factor
    if stock < need: raise 'Insufficient stock'
    deduct stock; insert sale_item(quantity = qty, ...)
subtotal := Σ line_total ; total := subtotal − hdr_disc + tax   -- authoritative
```

**Key points:**
- Client jo `amount` bhejta hai, uski **weight server calculate karta hai** — client-side
  manipulation ka koi raasta nahi. (Client sirf preview dikhata hai.)
- `list_price`, `factor` **hamesha catalog se** — client price bheje to ignore.
- Rounding: `amount` mode me `qty = round(amount/rate, 3)`; phir `line_total = round(rate*qty,2)`.
  **CONFIRMED rule:** amount mode me `line_total := amount` exactly (customer ne Rs 200 diya to
  Rs 200 hi lagega). `qty = round(amount/rate, 3)` sirf stock-deduction + approximate display ke
  liye. Chhota residual stock me reh sakta hai — acceptable.
- `numeric(12,3)` qty, `numeric(12,2)` money — kabhi float JS math nahi (CLAUDE.md money rule).

### 6.3 Negative/oversell prevention

- Stock check `need := qty * factor` base-units me, `numeric` comparison. `< 0` kabhi nahi
  hoga kyunki check pehle hota hai.
- Loose pe `qty > 0` constraint + amount-mode me `amount > 0` guard.

### 6.4 Retail/Wholesale eligibility + loose-minimum enforcement (NEW — server-authoritative)

UI restriction sirf convenience hai; asli enforcement `create_sale` v4 me. Signature me ek naya param:
`p_allow_override boolean default false`. Per-item catalog lookup (jo pehle se factor + price laata hai)
me ab eligibility flags bhi aa jaayenge.

```
-- create_sale v4 header:
v_is_admin  := (v_role = 'admin');
v_override  := p_allow_override and v_is_admin;   -- employee ka override ignore

for each item:
    (factor, list_price, retail_ok, wholesale_ok) := lookup product_units
                                                      by (product_id, unit_name)   -- catalog only
    kind := products.product_kind ; wmin := products.wholesale_min_qty

    -- ── §2.7 eligibility (skip if override) ──
    if not v_override then
        if v_is_retail    and not retail_ok    then raise 'Item % retail me nahi bikta (unit %)', name, unit;
        if not v_is_retail and not wholesale_ok then raise 'Item % wholesale me nahi bikta (unit %)', name, unit;
    end if;

    ... qty / amount compute (existing) ...

    -- ── §2.8 loose wholesale minimum (skip if override) ──
    if not v_override and kind = 'loose' and not v_is_retail
       and wmin is not null and qty < wmin then
        raise 'Wholesale minimum for % is % %', name, wmin, base_unit;
    end if;

    ... discount cap, stock check, deduct (existing) ...
```

**Key points:**
- Flags + kind + wmin **hamesha catalog se** — client kuch bhej bhi de to ignore (jaise prices).
- `p_allow_override` client se aata hai lekin **sirf admin caller pe honor** hota hai; role `auth.uid()`
  se DB me verify (client role claim pe bharosa nahi).
- Override off (default) → poori enforcement. Ye H2/discount-cap jaisa hi server-authoritative pattern hai.
- Audit: override-wali sale ko `sales` par ek flag/note (e.g. `override_by`) se mark karna optional but
  recommended — taake baad me pata chale kis manager ne bypass kiya.

**Migration note:** ye sab ek naye `0008_retail_wholesale_eligibility.sql` me:
`product_units.retail_eligible/wholesale_eligible`, `products.wholesale_min_qty`, aur `create_sale` v4
(drop+recreate with `p_allow_override`). Sab defaults backward-compatible (flags true, wmin null,
override false) → maujooda sales bilkul unaffected.

---

## 7. Edge Cases & Decisions Needed

| # | Edge case | Recommended handling | **Aapka faisla chahiye?** |
|---|---|---|---|
| 1 | **Broken case** (crate me se 5 bottle) | Stock bottles me hai → automatic. Cashier `bottle` unit qty 5 chunta hai. | Nahi — already ok |
| 2 | **Weight rounding** | qty `numeric(12,3)` (1g precision). | Nahi |
| 3 | **Amount-mode rounding** (Rs 200 → 0.769 kg → line 199.94?) | ✅ **CONFIRMED:** line_total = exact `amount`; qty approximate (approx chip). | Locked |
| 4 | **Negative stock (loose)** | Server pre-check, reject. ✅ **CONFIRMED:** koi min floor nahi — sirf `qty > 0`. | Locked |
| 5 | **Barcode: fixed-pack vs loose** | Packaged/beverage: barcode → seedha add (qty 1). Loose: barcode product ko select karta hai, phir weight/amount **maangna** padta hai (auto qty 1 nahi). | Nahi — plan me handle |
| 6 | **Loose product ki printed barcode** (shop scale label) | ✅ **CONFIRMED:** abhi nahi. Manual entry; scale barcode parser Phase 1 me skip. | Locked |
| 7 | **Parked sale stock reservation** | ✅ **CONFIRMED: NO reservation.** Oversell checkout pe server-authoritative reject. | Locked |
| 8 | **Parked sale + offline** | Parked sales IndexedDB me persist (existing pattern). Checkout offline ho to existing offline-queue me chala jaata hai. | Nahi |
| 9 | **Employee discount cap on loose** | Same server cap — amount/weight se farq nahi padta, discount % pe cap. | Nahi |
| 10 | **Stok in weight, purchase in bags** | Purchase 1 bag = 50kg → unit factor 50, base kg. Stock += 50. Already works numeric ke baad. | Nahi |
| 11 | **Cigarette: broken carton → packs** | Carton khareed ke packs bechna: stock packs me hai, `carton` sale 10 packs deduct karti hai. Retail me pack becho, wholesale me carton. Automatic. | Nahi — already ok |
| 12 | **Cigarette: single pack wholesale rate pe** | Block (pack `wholesale_eligible=false`). Server reject. Special customer → **admin override**. | ✅ Confirm override flow |
| 13 | **Cigarette: poora carton retail me** | Block (carton `retail_eligible=false`). Wholesale switch karo ya override. | Nahi — §6.4 |
| 14 | **Wholesale below loose-minimum** (5kg cheeni jab min 20kg) | Server reject "min 20 kg". Retail me theek. Override se bypass (admin). | ✅ Confirm min-qty rule |
| 15 | **Single loose cigarette (khuli/stick)** | v1 me **NOT supported** — pack sabse chhoti unit. Agar chahiye: base unit `stick` karo (pack = unit factor 20, carton = 200), phir stick retail me bik sake. **Faisla:** chahiye ya nahi? | ✅ Batao: khuli cigarette bechni hai? |
| 16 | **Mode switch cart line ineligible** | POS auto-switch to mode ki default eligible unit (§4.4) + note. Agar koi eligible unit nahi → line flag. | Nahi — §4.4 |
| 17 | **Employee override attempt** | `p_allow_override` bheje bhi to server role check pe ignore (sirf admin). | Nahi — §6.4 |

---

## 8. Implementation Phases

Chhote, test-able chunks. Har phase ke baad `npm run typecheck` + dono roles + dono languages
test (CLAUDE.md). Staging Supabase pe migrations pehle.

### **Phase A — Loose items backend (foundation)**
1. Migration `0006`: `product_kind`, numeric widening, constraints.
2. `create_sale` v3: `input_mode` (qty|amount), server reverse-calc, numeric qty, standard=integer guard.
3. Types update (`product_kind`), cache buster bump.
4. **Test:** RLS still solid, existing standard sales unaffected (regression), ek loose product manually seed karke weight + amount sale.

> Ye phase sabse pehle kyunki baaki sab isi pe khada hai. Ismein **koi UI nahi** — sirf schema
> + RPC. Isse existing POS bhi break nahi hoga (backward compatible payload).

### **Phase B — Product management (loose data entry)**
1. ProductDrawer: `product_kind` selector; loose pe base_unit = kg/litre, per-kg rate, pack presets add.
2. Beverage data-entry helper (bottle+crate quick setup) — optional convenience.
3. **Test:** loose product create/edit, pack units save, admin-only cost intact.

### **Phase C — POS loose selling + cash/change**
1. Cart line loose control (Pack/Weight/Amount toggle) + server preview.
2. Amount-mode reverse-calc preview.
3. Cash-tendered + change-due UI + quick-amount buttons + Exact.
4. Beverage bottle/crate default-by-mode nicety.
5. **Test:** teeno loose modes end-to-end, change calc, receipt sahi qty/weight dikhaye (bilingual).

### **Phase D — Keyboard-driven POS**
1. Global keydown handler + shortcut map (§5), field-focus awareness.
2. On-screen `kbd` hint chips + F1 cheat sheet.
3. Page Up/Down section cycling.
4. **Test:** har shortcut, conflicts, RTL me bhi kbd hints theek.

### **Phase E — Multi-tab parked sales**
1. Parked-sale state model + IndexedDB persistence (`costmatic_parked_sales`).
2. Tab bar UI, new/switch/hold/cancel, `Alt+N`/`Alt+1..5`.
3. Refresh-safe restore; offline checkout compatibility.
4. **Test:** multiple tabs independent state, refresh restore, offline queue se conflict na ho.

### **Phase F — Polish & QA**
1. Receipts: loose qty formatting (0.350 kg), beverage crate lines.
2. Reports: loose items ka qty aggregation (kg sum) — `get_item_sales` numeric-safe.
3. Testing-QA skill ke hisab se money/stock/weight unit tests (jab test runner add ho).
4. Edge-case sweep (§7).

### **Phase G — Cigarettes + Retail/Wholesale eligibility (NEW)**
1. Migration `0008`: `product_units.retail_eligible/wholesale_eligible`, `products.wholesale_min_qty`,
   `create_sale` v4 with `p_allow_override` (§6.4). Sab backward-compatible defaults.
2. ProductDrawer: cigarette data-entry (base `pack` + `carton` factor 10) + per-unit eligibility toggles
   + loose `wholesale_min_qty` field.
3. POS (§4.4): mode-based unit filtering, mode-switch auto-fix, loose min-qty hint, admin-only override toggle.
4. Seed cigarette brands (§12).
5. **Test:** retail me carton block, wholesale me pack block, loose below-min reject, admin override bypass,
   employee override ignored (server), both roles + both languages.

> Ye phase A–F ke **baad** aata hai (unpe depend karta hai: product_kind, numeric qty, POS loose UI).
> Beverage bhi is phase me strict-eligibility pe aa jaata hai (retail=bottle only, wholesale=crate only).

**Suggested order rationale:** A (backend) → B (data in) → C (sell it) → D/E (speed features,
independent, kisi bhi order me) → F (polish) → **G (cigarettes + eligibility rule)**. D aur E ek dusre
se independent hain, parallel ho sakte.

---

## 9. Reports & Receipts Impact (heads-up)

- `get_item_sales` (reports RPC): `sum(quantity)` ab numeric — loose ka "total_qty" 12.500 kg
  dikhega. Report UI me unit-aware formatting chahiye (kg vs pieces). Chhota change, Phase F.
- Receipts (`SalesPage` `openReceiptWindow`): qty column ko `0.350 kg` / `1 crate` / `2 piece`
  format karna. Bilingual already handled.
- Profit RPC (`get_period_profit`): `cost_price * quantity * factor` — numeric ke baad bhi
  correct (loose ka cost per-kg × kg). Verify only.

---

## 10. Kya Main NAHI Kar Raha (Explicit Non-Goals)

- ❌ Naya `product_variants` table (existing `product_units` kaafi hai — kam risk).
- ❌ Deployed clients ke schema ko chhedna (ye independent copy hai).
- ❌ Weighing-scale hardware integration Phase 1 me (manual weight entry; scale later).
- ❌ Stock reservation across parked sales (server-authoritative checkout se guard).
- ❌ RxDB/PowerSync (CLAUDE.md — v1 offline pattern hi extend karenge).

---

## 11. Confirmed Decisions (locked — 2026-08-07)

1. ✅ **Amount-mode rounding:** Line total = **exact diya gaya amount** (Rs 200 = Rs 200.00).
   Qty approximate/rounded display ke saath ("approx" chip). Server: `qty = round(amount/rate, 3)`
   sirf display/stock ke liye; `line_total := amount` (exact). Stock deduction `qty × factor`
   se hoti hai (rounded qty), yani chhota residual stock me reh sakta hai — acceptable.
2. ✅ **Minimum loose sale weight:** koi floor nahi. Sirf `qty > 0` (aur amount-mode me `amount > 0`)
   guard. 10g (0.010 kg) bhi valid.
3. ✅ **Scale barcodes:** abhi **nahi**. Manual weight/amount entry (future USB scale auto-fill
   ke liye field ready rahega). Koi GS1/prefix parser Phase 1 me nahi.
4. ✅ **Parked sales:** **no reservation.** Oversell checkout pe server-authoritative reject.
5. ✅ **Pack presets:** **per-product `product_units` (simple)** — Phase B me manually add. Shared
   `loose_pack_presets` table abhi **skip** (§2.4 optional hi rahega, baad me agar data-entry
   bojh lage to add karenge).

**Sab decisions final. Phase A (migration `0006` + `create_sale` v3) likhne ke liye ready.**

---

## 12. Cigarettes — Seed Data (Pakistani Brands)

Do bade manufacturers dominate: **Pakistan Tobacco Company (PTC / BAT)** aur **Philip Morris Pakistan /
Lakson Tobacco**, plus local (Khyber Tobacco etc.). Har brand+variant ek `product` (base `pack`, `carton`
factor 10). Prices/availability **shop se verify** karein — neeche starter seed list hai:

| Brand (product) | Manufacturer | Tier | Note |
|---|---|---|---|
| John Player Gold Leaf (Gold Leaf) | PTC/BAT | Premium | "Gold Leaf" ke naam se mash-hoor |
| Benson & Hedges (B&H) | PTC/BAT | Premium | |
| Dunhill | PTC/BAT | Premium | |
| Capstan by Pall Mall | PTC/BAT | Mid | top-selling |
| Gold Flake | PTC/BAT | Mid | |
| Embassy | PTC/BAT | Mid/Economy | |
| Marlboro | Philip Morris | Premium | Red / Lights variants |
| Morven Gold | Philip Morris | Economy | top-selling economy |
| Red & White | Philip Morris | Economy | |
| Diplomat | Philip Morris | Economy | |
| K2 | Khyber Tobacco | Economy | |
| Parliament | Philip Morris | Premium (imported) | optional |
| L&M | Philip Morris | Mid | optional |
| Pine / Classic / Master | local | Economy | region ke hisab se |

- **Category:** ek nayi `categories` row "Cigarettes / سگریٹ".
- **Variants:** jahan brand ke Red/Lights/Blue alag hon, wo alag `product` (jaise beverage sizes).
- **Units har product pe:** `pack` (factor 1, retail-only) + `carton` (factor 10, wholesale-only).
- Ye list Phase G me seed hogi; exact retail/wholesale rates shopkeeper daalega.

> ⚠️ Legal/compliance note (Pakistan): tobacco pe printed retail price / track-&-trace stamp aur
> minimum-price rules hote hain. POS bas bikri record karta hai — pricing compliance shopkeeper ki
> zimmedari; is plan me koi regulatory logic nahi.

---

## 13. Confirmed Decisions — Phase G (locked 2026-08-08)

1. ✅ **Cigarette base = `pack`** (no single stick). pack (factor 1, retail-only) + carton (factor 10,
   wholesale-only). Single-stick sales v1 me NOT supported. *(§2.5b, §7 #15)*
2. ✅ **Loose wholesale minimum:** per-product `products.wholesale_min_qty` (cheeni default 20kg). Retail
   pe minimum nahi apply hota. *(§2.8, §7 #14)*
3. ✅ **Override: admin-only + audit-mark.** `p_allow_override` sirf `role='admin'` pe honor; employee
   ka override server ignore. Override-wali sale par `sales.override_by = admin uid`. *(§2.9, §6.4, §7 #17)*
4. ✅ **Beverage strict** (jaise cigarette): retail=bottle-only, wholesale=crate-only. Broken-case
   wholesale ab admin override se hi. *(§2.7, §7 #12)*
5. ✅ **Standard packaged: both-true default** (koi enforcement nahi; backward-compatible). Shopkeeper
   chahe to per-unit flag opt-in kar sakta. *(§2.7)*

**Sab final. Phase G (migration `0008` + product mgmt + POS eligibility) implement ready.**