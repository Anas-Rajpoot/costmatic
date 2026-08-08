# Kiryana Product Research & Gap Analysis

> Online research (2026-08-08) on real Pakistani kiryana/general-store products aur unki
> **variations/units**, phir current Costmatic model se compare karke **gaps + improvements**.
> Sources neeche §7. Ye document review ke liye hai — code baad mein, aap ki direction ke saath.

---

## 0. TL;DR — Honest assessment

Current model (`product_units` + `product_kind` + eligibility flags) **foundation strong hai** —
multi-unit, loose weight, hierarchical units (piece→dozen→carton), retail/wholesale sab handle karta.
Lekin maine **kiryana ki asal product range + unit-variations research nahi ki thi**, isliye gaps:

1. **Dual-form (khula + packet):** ek item **loose weight** AUR **sealed branded packet** dono bikta —
   currently product `standard` YA `loose` hai, dono ek saath nahi.
2. **Category tree galat:** seeded categories **beauty/cosmetics** ke hain (Makeup, Skincare…) — kiryana
   ka koi taxonomy nahi. Categories table hierarchical hai (`parent_id`) par seed flat + wrong domain.
3. **Unit presets galat domain:** presets beauty-ish hain (dozen, carton=144). Kiryana ko chahiye:
   **bag (5/10/20kg), tin/can (16L), egg-crate (30), biscuit roll**, etc.
4. **Oil/ghee multi-size:** 1L pouch / 3L bottle / 5L can / **16L tin** — model handle kar leta hai
   (multi-unit), bas presets + data chahiye.
5. **Chhoti loose quantity UX:** masala 50g = `0.050 kg` likhna awkward — **gram/ml quick entry** behtar.

**Matlab: schema mostly theek hai; asal kaam = sahi kiryana DATA (categories + presets + seed)
+ dual-form handling + thodi UX.** Neeche detail.

---

## 1. Pakistani Kiryana — Product Taxonomy + Kaise Bikte Hain

| Category | Common items | Kaise bikta (units/variations) | Base unit |
|---|---|---|---|
| **Aata / Flour** | wheat (chakki atta, maida), besan, corn (makai), rice flour | **khula by kg** + **bag 5/10/20 kg** (20kg standard flour bag) | kg |
| **Chawal / Rice** | basmati, super-kernel, **sella (parboiled)**, 1121, steam, tota (broken) | **khula by kg** + bag 1/5/10/25 kg; **variety = alag product** (price/quality bohot alag) | kg |
| **Daal / Pulses** | masoor, moong, mash (urad), chana, whole vs dhuli (split) | **khula by kg** + packet 500g/1kg; har type alag product | kg |
| **Cheeni / Sugar** | white, brown | **khula by kg** + branded pack 1kg | kg |
| **Ghee / Cooking Oil** | Dalda, Sufi, Habib, Kausar… + **khula ghee** | **khula by kg** + **pouch 1kg/1L**, **5kg pillow pouch**, **bottle 1/3/4.5/10 L**, **tin/can 5L**, **16 L can**, carton (1L×5) | litre or kg |
| **Masala / Spices** | haldi, mirch, dhania (khula) + **Shan/National sachets** | **khula by weight (50–100g)** + branded box **50g / 100g**; whole spices by weight | kg (ya gram) |
| **Chai / Tea** | Tapal, Lipton, Vital | pack **100g / 200g / 475g / 900g**, tea-bags box (50/80 count) | piece/pack |
| **Namak / Salt** | iodized, rock | khula + packet 800g/1kg | kg |
| **Anday / Eggs** | farm, desi | **piece → dozen (12) → crate/peti (30)** | piece |
| **Dairy** | milk pack (250ml/1L), Nido/Everyday powder (sachet/pouch/tin) | pack + sachet + tin | piece/ml |
| **Beverages** | Coke, Pepsi, juices, water | **bottle → crate** (done ✓) | bottle |
| **Cigarettes** | (research done ✓) | **pack → carton (10)** (done ✓) | pack |
| **Biscuits / Snacks** | Sooper, Gala, chips, toffees | **piece → ticky/family pack → roll (box of packs) → carton** | piece |
| **Soap / Detergent** | Surf, Bonus, bar soap | bar (piece), **Surf sachet / 500g / 1kg / 3kg bag** | piece/kg |
| **Personal care** | shampoo (**sachet** vs bottle), toothpaste, blades | piece / sachet / bottle | piece |
| **Cleaning** | phenyl, bleach, harpic | bottle, khula by litre | piece/litre |

**Do bade patterns jo model ko handle karne hain:**
- **A. Dual-form:** bohot se staples (cheeni, atta, daal, chawal, ghee) **khula AUR packet** dono.
- **B. Multi-size sealed packs:** ek brand ke 4-5 sizes (oil pouch/bottle/tin) — har size apna price/barcode.

---

## 2. Current Model Kya Pehle Se Handle Karta Hai (✅)

- **Multi-unit per product** (`product_units`): oil ke pouch/bottle/tin, egg piece/dozen/crate — sab
  ek product ke units ban sakte hain, har ek apna price. **Egg 3-level (piece→dozen→crate30) works.**
- **Loose weight** (`product_kind='loose'`): khula cheeni/atta/daal/oil by kg/litre, fractional + amount mode. ✓
- **Retail/wholesale eligibility + wholesale-min:** bulk vs single already. ✓
- **Hierarchical categories** (`categories.parent_id`): tree schema mojood hai (bas seed nahi). ✓
- **Varieties as separate products:** basmati vs sella = alag products (sahi approach). ✓

**Yani ~70% real kiryana model already fit hai. Gaps zyadatar DATA + 2 features hain.**

---

## 3. Gaps (Prioritized)

### 🔴 GAP-1 — Dual-form: khula + sealed packet (same item)
Shop "khula cheeni" (by kg, bulk stock) AUR "Cheeni 1kg packet" (sealed SKU, apna barcode/price,
**alag stock pool**) dono bechti hai. Ye **do alag cheezein hain** (bulk se measure ≠ sealed bag).

- **Sahi approach:** **do alag products** — loose ("Cheeni — khula", loose kg) + standard ("Cheeni 1kg
  Pack", piece). Ye already possible hai. **Lekin** unhein link karne ka koi tareeqa nahi (navigation/
  reporting ke liye "same item, different form").
- **Improvement:** optional **variant-group** (`products.group_id` ya `product_groups` table) jo same
  item ke khula + packet + brands ko group kare — sirf UI grouping + combined reporting ke liye, stock/
  pricing alag rahe. **Ya v1 me skip** (do products kaafi hain), sirf naming convention se manage.

### 🔴 GAP-2 — Category tree beauty ka hai, kiryana ka chahiye
`0001` seed: Makeup, Skincare, Perfumes… (cosmetics). Kiryana ke liye **naya hierarchical seed**:
```
Grains & Flour → Wheat Flour / Maida / Besan / Corn / Rice Flour
Rice → Basmati / Sella / Broken (Tota) / Everyday
Pulses (Daal) → Masoor / Moong / Mash / Chana
Oil & Ghee → Cooking Oil / Banaspati Ghee / Desi Ghee (khula)
Sugar & Sweeteners
Spices & Masala → Whole / Ground / Recipe Mixes (Shan/National)
Tea & Coffee
Dairy & Eggs
Beverages → Soft Drinks / Juices / Water
Snacks & Biscuits
Cleaning & Detergents
Personal Care
Cigarettes & Tobacco
```
+ UI category picker ko **tree-aware** karna (abhi flat dropdown). *(admin-configurable rahe — ye seed
default hai jise shopkeeper edit kar sake.)*

### 🟠 GAP-3 — Unit presets kiryana-tuned nahi
Current standard presets: 3-pack/6-pack/dozen/**crate(24)**/carton(144). Kiryana ko chahiye
**base-unit-aware** presets:
- `kg` base (loose): 250g/500g/1kg/2kg/**5kg bag**/**10kg bag**/**20kg bag**
- `litre` base (loose oil): 500ml/1L/**3L**/**5L**/**16L tin**
- `piece` base: **dozen(12)**, **egg-crate(30)**, **biscuit roll(12/24)**, carton
- `pack` base (cigarette): carton(10) ✓
- `bottle` base (beverage): crate(24/12) ✓

### 🟠 GAP-4 — Chhoti loose quantity (masala) UX
Masala 50g = `0.050 kg` likhna galti-prone. **Improvement:** loose line pe **gram/ml quick input**
(unit toggle "kg | g"), ya common chhote presets (50g/100g/250g) buttons. Server wahi (base kg) rahe.

### 🟡 GAP-5 — Oil/ghee "khula from tin" + sealed both
Oil khula (by litre/kg from a 16L tin) = loose product. Sealed pouch/bottle/tin = standard product with
multi-unit. Same as GAP-1 (dual-form). Data + presets se handle ho jaata hai.

### 🟡 GAP-6 — Seed/demo data
Reference kiryana products (correct units/variations) seed nahi. Testing + shopkeeper onboarding ke
liye ek **kiryana seed set** (10-15 representative products) helpful.

---

## 4. Proposed Improvements — "Phase H: Kiryana Data & UX"

| # | Improvement | Effort | Priority |
|---|---|---|---|
| H1 | **Kiryana category tree** seed (hierarchical) + tree-aware category picker in ProductDrawer/filters | Med | 🔴 High |
| H2 | **Base-unit-aware unit presets** (bag 5/10/20kg, tin 16L, egg-crate 30, biscuit roll) | Low | 🔴 High |
| H3 | **Gram/ml quick entry** for loose (kg|g toggle + small-qty preset buttons) | Low | 🟠 Med |
| H4 | **Kiryana seed products** (reference set with correct variations) — behind an admin "load sample data" or a migration | Low | 🟠 Med |
| H5 | **Variant-group** to link khula + packet + brand variants (nav + combined reports) | Med-High | 🟡 Low (optional) |
| H6 | ProductsPage/Reports: category-tree grouping, variety-aware display | Med | 🟡 Low |

> **Note:** GAP-1/dual-form ke liye **schema change zaroori nahi** — do products (loose + standard) already
> kaam karte hain. H5 (grouping) sirf convenience hai, optional. Yani Phase H mostly **data + presets + UX**,
> bara schema rewrite nahi.

---

## 5. Sawal — Aap Se Direction Chahiye (Phase H se pehle)

1. **Dual-form (khula + packet):** do alag products (simple, aaj kaam karta) — theek? Ya variant-grouping
   (H5) chahiye taake ek jagah link ho? *(Recommend: v1 = do products; grouping baad me.)*
2. **Category tree:** kya main ek **standard kiryana category tree seed** karun (aap edit kar sakein), ya
   aap apni khud ki category list dena chahenge?
3. **Sample/seed products:** kya reference kiryana products seed karun (demo/onboarding), ya sirf presets +
   categories, products shopkeeper khud daalega?
4. **Gram entry:** loose pe `kg | g` toggle + chhote presets (50g/100g/250g) — chahiye?
5. **Priority:** H1+H2 (categories + presets) pehle karun (sabse zyada impact), phir baaki? Ya koi aur order?

In jawabon ke baad Phase H implement karta hoon. Ye analysis-only hai — abhi koi code change nahi.

---

## 6. Kya Ye Existing Kaam Ko Badalta Hai?

Nahi — Phase A–G (loose, POS, cigarettes, eligibility) sab **as-is valid** hain. Phase H unke **upar
data + presets + UX** add karta hai. Koi migration rollback ya breaking change nahi (category re-seed
admin-configurable hai; presets frontend hain; grouping optional additive).

---

## 7. Sources

- [Metro Pakistan — General Store & Kiryana](https://www.metro.pk/Our-Customers/General-Store-and-Kiryana) ·
  [Metro Online Grocery](https://www.metro.pk/Online-Supermarket/Online-Grocery)
- [Kirana vs General Store (categories)](https://agri.faisalzariservice.com/2025/02/general-store-and-kirana-store-difference.html?m=1) ·
  [Retail in Pakistan overview](https://www.linkedin.com/pulse/retail-pakistan-overview-sohail-ahmed)
- Oil/Ghee sizes: [Al-Fatah Oil & Ghee](https://alfatah.pk/collections/oil-ghee) ·
  [Dalda pouch/bottle/tin](https://pff.org.pk/dalda) ·
  [GrocerApp Dalda carton 1L×5](https://grocerapp.pk/products/dalda-cooking-oil-pouch-carton-pack-1-ltr-x-5-91144/)
- Pulses/Rice varieties: [Himalayan Chef Pulses](https://himalayanchef.pk/collections/pulses) ·
  [Pak Rice Mill varieties](https://pakricemill.com/rice-varieties/) ·
  [Keryana Store — Pulses](https://keryanastore.com/Grocery-Staples/Pulses)
- Spice packet sizes: [Shan 50g/100g (Amazon listings)](https://www.amazon.com/Shan-Biryani-Masala-50g/dp/B002NMVOBW)
- Eggs by dozen: [foodpanda 12-pc eggs](https://www.foodpanda.pk/groceries/product/ACYWIK/farm-fresh-classic-eggs-12-pieces) ·
  [Naheed eggs](https://www.naheed.pk/groceries-pets/breakfast/eggs)
- Flour bag 20kg: [Express Tribune flour rates](https://tribune.com.pk/story/2566687/retailers-reject-new-flour-rates)
