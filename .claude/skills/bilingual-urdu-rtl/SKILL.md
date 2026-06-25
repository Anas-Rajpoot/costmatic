---
name: bilingual-urdu-rtl
description: English + Urdu localisation and right-to-left (RTL) support for the wholesale shop app. Use this whenever you add or edit ANY screen, label, button, table, message, toast, receipt, or form — every string must be translatable and every layout must work in RTL. Trigger it even when the user doesn't mention language; bilingual + RTL is a baseline requirement, not a feature.
---

# Bilingual (English/Urdu) + RTL

Setup uses react-i18next with `locales/en.json` and `locales/ur.json`. Default language comes from settings.

## Rules
- No hardcoded user-facing text. Wrap with `t('key')`; add the key to BOTH `en.json` and `ur.json` in the same change. A missing Urdu key is a bug.
- Toggle language by changing i18n language AND `document.documentElement.dir` (`rtl` for Urdu, `ltr` for English). Persist the choice per user.
- Use Tailwind logical properties so layouts mirror automatically: `ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`/`text-end`. Avoid `pl-`, `ml-`, `left-`, `text-left`.
- Icons that imply direction (arrows, chevrons, back) must flip in RTL.
- Load Noto Nastaliq Urdu; apply it to Urdu text. Keep prices/quantities in Latin digits for clarity unless the shop asks otherwise.

## Product data
Products store `name_en` and `name_ur`. Show the active language's name; fall back to the other if one is empty. Search must match BOTH fields so staff can find items either way.

## Gotchas
- Numbers, dates, and currency: format with a single helper, not inline, so RTL doesn't reverse a price.
- Receipts/statements: pick the language at print time; mixed EN/UR lines are fine but keep alignment consistent.

## Definition of done
Switching to اردو flips the whole layout cleanly, every visible string is translated, product search finds items by English or Urdu name, and nothing overflows or misaligns in RTL.
