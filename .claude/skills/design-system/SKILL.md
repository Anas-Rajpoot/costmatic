---
name: design-system
description: The visual language for the wholesale shop app — deep teal brand, gold accent, semantic colours (green cash / red udhaar / amber low-stock), Inter + Noto Nastaliq Urdu type, and subtle motion. Use this on EVERY screen, component, button, table, card, badge, toast, or empty state you build or restyle, so the whole app looks like one product. Apply it even when the user just says "make a page" without mentioning design.
---

# Design system

Full tokens live in `wholesale-shop-software-spec.md` Section 16. Mirror them in `tailwind.config.js`.

## Colour rules
- Brand teal `#0E6E58` for primary actions, active nav, links; dark `#0C4A3D` for sidebar/top bar.
- Gold `#C99A3E` only for the logo and small premium accents — never large fills.
- Semantic colour MUST encode meaning, not decoration:
  - green `#15924F` = cash / paid
  - red `#D33A4F` = udhaar / amount due / alerts
  - amber `#E08A1E` = low stock / near-expiry
- Page `#F6F7F5`, cards white, hairline borders `#E6E9E6`. No heavy shadows.

## Type
- Inter for UI + numbers, with tabular figures (`font-feature-settings:"tnum"`) so price columns align.
- Noto Nastaliq Urdu for Urdu (Noto Sans Arabic option for dense Urdu tables).
- Sentence case everywhere. Weights 400 + 600 only. Totals 28–32px.

## Layout & feel
- Min touch target 44px. Radius 10–12px cards/buttons, 8px inputs.
- On the billing screen the **total** and **pay buttons** are the largest elements; keep everything else quiet.

## Motion (150–250ms, subtle, purposeful — never decorative)
- Sections fade + 8px slide-up on load.
- Scanned cart item slides in with a green check + brief teal left-edge highlight.
- Totals "pop" (scale) when they change. Buttons: 150ms hover, scale(0.98) press.
- Toasts slide in top-right, auto-dismiss. Lists use skeleton shimmers, not spinners.
- Always wrap non-essential motion in `prefers-reduced-motion`.

## Definition of done
Uses theme tokens (no raw hex), correct semantic colour for the meaning, Inter/Nastaliq, sentence case, and at most the motions above. Looks identical in spirit to every other screen.
