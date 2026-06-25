# Wholesale Shop App — Claude Code Skill Pack

A set of skills that keep your vibe-coded wholesale shop software consistent across every area. Each skill teaches Claude Code the rules, gotchas, and "definition of done" for one part of the workflow, so screens and logic stay uniform no matter when you build them.

> Pair these with the master spec (`wholesale-shop-software-spec.md`). The skills reference its sections; keep it in the repo root.

## Install (Claude Code)

Project-level skills usually live in your repo at `.claude/skills/<skill-name>/SKILL.md`, and personal ones in `~/.claude/skills/`. Copy the folders from this pack into `.claude/skills/`.
Confirm the exact current location in the Claude Code docs: https://docs.anthropic.com/en/docs/claude-code/claude_code_docs_map.md

```
your-repo/
├─ .claude/
│  └─ skills/
│     ├─ project-setup/SKILL.md
│     ├─ design-system/SKILL.md
│     └─ ...etc
└─ wholesale-shop-software-spec.md
```

Skills trigger automatically from their description when a task matches — you don't call them by name. You can also say e.g. "use the udhaar-khata skill".

## The pack (maps to the build phases in the spec)

| # | Skill | Build phase | What it governs |
|---|-------|-------------|-----------------|
| 1 | project-setup | 0 | Stack scaffold + coding conventions |
| 2 | design-system | 0 | Teal/gold tokens, fonts, motion |
| 3 | bilingual-urdu-rtl | 0 | English/Urdu + RTL on every screen |
| 4 | supabase-data-layer | 1–5 | Tables, migrations, RLS, triggers |
| 5 | auth-and-rbac | 1 | Admin vs employee, guards, server rules |
| 6 | inventory-and-units | 2 | Products, categories, carton/dozen/piece |
| 7 | barcode-scanning | 4 | USB scanner, camera, label printing |
| 8 | pos-billing | 4 | Cart, units, cash/udhaar/mixed checkout |
| 9 | udhaar-khata | 5 | Customer/supplier ledgers, balances |
| 10 | purchases-suppliers | 3 | Stock-in, supplier balances |
| 11 | printing-receipts | 4–6 | Thermal receipts, invoices, statements |
| 12 | reports-dashboard | 6 | Reports with role-based visibility |
| 13 | offline-sync-pwa | 7 | PWA, offline cache, sync queue |
| 14 | testing-qa | all | How to test each module |
| 15 | deployment | 8 | Vercel + Supabase, env, backups |

## Suggested order
Build top-to-bottom. Skills 1–3 set the foundation every later screen depends on, so install and use them first.
