# WhatsApp automation — setup runbook

Two backend flows, both via the **official Meta WhatsApp Cloud API**:

1. **Auto receipt on sale** — when a sale is saved for a customer who has a phone
   number, a receipt is sent to their WhatsApp automatically. Backend only.
2. **Weekly khata/udhaar reminder** — every Monday, customers with an outstanding
   balance get a "please clear your dues" message.

Nothing appears in the frontend. The code is already in the repo; this document
is the one-time activation. **Until these steps are done the feature stays inert
and does not affect sales.**

---

## What only you can provide

WhatsApp does not allow automated messaging from a normal/personal account, so:

- **A Meta Business account** + **WhatsApp Business Platform (Cloud API)** app.
- **A dedicated phone number** that is **not** currently used in the WhatsApp app.
- **Two approved message templates** (Meta reviews them, ~1 day). Drafts below.
- A **permanent access token** and the **phone-number ID** from Meta.

It is **paid per conversation** (utility templates are inexpensive in Pakistan; the
first 1,000 conversations/month have historically been free).

---

## 1. Approve the templates (Meta → WhatsApp Manager → Message Templates)

The code sends body parameters in a fixed order; your templates must match.

**`sale_receipt`** (category: Utility) — 4 variables:
> Thank you {{1}}. Invoice {{2}}: total Rs {{3}}, balance due Rs {{4}}. — Costmatic

**`dues_reminder`** (category: Utility) — 2 variables:
> Reminder: Dear {{1}}, your pending balance is Rs {{2}}. Please clear your dues. Thank you. — Costmatic

(You can change the wording; keep the number/order of `{{n}}` variables the same,
or update `bodyParams` in the edge functions.)

## 2. Set the edge-function secrets

```bash
supabase secrets set \
  WHATSAPP_TOKEN="<permanent token>" \
  WHATSAPP_PHONE_ID="<phone number id>" \
  WHATSAPP_HOOK_SECRET="<any long random string>" \
  WHATSAPP_RECEIPT_TEMPLATE="sale_receipt" \
  WHATSAPP_REMINDER_TEMPLATE="dues_reminder" \
  WHATSAPP_TEMPLATE_LANG="en"
```

## 3. Deploy the edge functions

```bash
supabase functions deploy whatsapp-receipt
supabase functions deploy whatsapp-reminders
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 4. Tell the database where the functions live + the shared secret

Run in the SQL editor (replace the secret with the **same** value as
`WHATSAPP_HOOK_SECRET` above):

```sql
alter database postgres set app.whatsapp_function_url = 'https://uddriaaonqehoggrlpnp.functions.supabase.co';
alter database postgres set app.whatsapp_hook_secret  = '<same as WHATSAPP_HOOK_SECRET>';
```

## 5. Apply the automation migration

This adds the after-sale trigger and the weekly cron job (both gated by a flag):

```bash
supabase db push        # or apply supabase/migrations/0003_whatsapp_automation.sql
```

## 6. Turn it on

```sql
update public.settings set value = 'true' where key = 'whatsapp_enabled';
```

To pause everything later, set it back to `'false'` — no redeploy needed.

---

## Testing

- **Receipt:** make a sale for a customer who has a phone number → they should
  receive the `sale_receipt` template within a few seconds.
- **Reminders:** run manually instead of waiting for Monday:
  ```bash
  curl -X POST 'https://uddriaaonqehoggrlpnp.functions.supabase.co/whatsapp-reminders' \
    -H 'x-hook-secret: <WHATSAPP_HOOK_SECRET>'
  ```
  It returns `{ total, sent, skipped }`.

## Notes / gotchas

- Customers must have opted in to receive WhatsApp messages (Meta policy). For a
  wholesale shop where customers share their number this is normally fine.
- Phone numbers are normalised for Pakistan (`03xx…` → `923xx…`). Adjust
  `toPakE164()` in `supabase/functions/_shared/whatsapp.ts` for other countries.
- The receipt is a text template, not a PDF. If you later want a PDF/image
  receipt attached, that uses a media template — ask and we'll extend it.
