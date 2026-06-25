// Weekly khata/udhaar follow-up.
//
// Invoked on a schedule (pg_cron — see migration 0003) or manually. Finds every
// customer with an outstanding balance and a phone number, and sends the approved
// dues-reminder template. Fully backend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorized, sendTemplate, toPakE164 } from '../_shared/whatsapp.ts'

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customers, error } = await supabase
    .from('customers')
    .select('name, phone, current_balance')
    .gt('current_balance', 0)
    .not('phone', 'is', null)

  if (error) return json({ error: error.message }, 500)

  let sent = 0
  let skipped = 0
  const failures: unknown[] = []

  for (const c of customers ?? []) {
    if (!c.phone) { skipped++; continue }
    const r = await sendTemplate({
      to: toPakE164(c.phone),
      template: Deno.env.get('WHATSAPP_REMINDER_TEMPLATE') ?? 'dues_reminder',
      // e.g. approved template: "Reminder: Dear {{1}}, your pending balance is Rs {{2}}. Please clear your dues. Thank you."
      bodyParams: [c.name, String(c.current_balance)],
    })
    if (r.ok) sent++
    else { skipped++; if (!r.skipped) failures.push(r.body) }
  }

  return json({ total: customers?.length ?? 0, sent, skipped, failures }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
