---
name: offline-sync-pwa
description: Offline-first behaviour and sync for the wholesale shop app — make it an installable PWA, keep it working when the internet drops, and sync queued sales/payments when it returns. Use this whenever you handle offline support, caching, the sync queue, connection status, or installability. Apply it carefully and incrementally — do NOT add heavy sync libraries before the simple version works.
---

# Offline / PWA / sync

Strategy: `wholesale-shop-software-spec.md` Sections 2–3. Build v1 first; v2 only if truly needed.

## v1 — do this first (simple, robust)
- Make the app an installable PWA with `vite-plugin-pwa` (works on the counter PC and the owner's phone).
- Persist TanStack Query cache to IndexedDB so the app **loads and all reads work offline**.
- Queue write actions (new sale, payment) locally when offline; push to Supabase when the connection returns.
- Show a clear status indicator: online / offline / syncing / synced.

## v2 — only if the shop is offline for long stretches
- Move to a local-first engine (RxDB or PowerSync) for full bidirectional sync. Do NOT start here — it adds a lot of complexity and is easy to get wrong.

## Conflict & integrity rules
- Generate `invoice_no` so offline sales can't collide: use a server sequence on sync, or a device-prefixed temporary number reconciled on upload.
- Re-validate stock on sync; flag (don't silently drop) a sale that would oversell, and surface it to the admin.
- Make sync idempotent — re-sending a queued sale must not create duplicates (use a client-generated UUID as the sale id).

## Gotchas
- Don't trust client clocks for ordering; store server timestamps on sync.
- Keep the offline queue visible so nothing is "lost" if a device fails.

## Definition of done
Pull the network: the app still loads, you can complete a sale, and the status shows "offline". Restore the network: queued sales upload exactly once with no duplicate invoice numbers and stock reconciles.
