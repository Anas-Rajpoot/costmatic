// Shared helper for sending WhatsApp **template** messages via the Meta Cloud API.
//
// Business-initiated messages (a receipt the customer didn't ask for, a weekly
// dues reminder) MUST use a template that has been approved in the Meta WhatsApp
// Manager. Free-form text is only allowed inside a 24h customer-initiated window.
//
// Required Supabase secrets (set with `supabase secrets set ...`):
//   WHATSAPP_TOKEN              permanent access token for the WA Business app
//   WHATSAPP_PHONE_ID          the phone-number id from Meta (NOT the number)
// Optional:
//   WHATSAPP_RECEIPT_TEMPLATE  template name for receipts   (default: sale_receipt)
//   WHATSAPP_REMINDER_TEMPLATE template name for dues        (default: dues_reminder)
//   WHATSAPP_TEMPLATE_LANG     template language code        (default: en)

const GRAPH_VERSION = 'v21.0'

export interface SendResult {
  ok: boolean
  skipped?: string
  status?: number
  body?: unknown
}

/** Send an approved template message. No-ops (skipped) when not configured yet. */
export async function sendTemplate(opts: {
  to: string
  template: string
  language?: string
  bodyParams?: string[]
}): Promise<SendResult> {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID')
  if (!token || !phoneId) {
    // Not configured — stay inert so sales/cron never fail because of WhatsApp.
    return { ok: false, skipped: 'not_configured' }
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: opts.to,
        type: 'template',
        template: {
          name: opts.template,
          language: { code: opts.language ?? Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en' },
          components: opts.bodyParams?.length
            ? [{
                type: 'body',
                parameters: opts.bodyParams.map((text) => ({ type: 'text', text })),
              }]
            : [],
        },
      }),
    },
  )

  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

/** Normalise a Pakistani phone number to E.164 digits, e.g. 0300-1234567 -> 923001234567. */
export function toPakE164(phone: string): string {
  let d = (phone ?? '').replace(/[^0-9]/g, '')
  if (d.startsWith('0')) d = '92' + d.slice(1)
  else if (d.length === 10) d = '92' + d // 3001234567 -> 92...
  return d
}

/** Verify the shared secret that the DB trigger / cron sends, if one is set. */
export function authorized(req: Request): boolean {
  const secret = Deno.env.get('WHATSAPP_HOOK_SECRET')
  if (!secret) return true // no secret configured yet
  return req.headers.get('x-hook-secret') === secret
}
