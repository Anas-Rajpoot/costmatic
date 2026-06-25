// Auto-send a WhatsApp receipt after a sale.
//
// Invoked server-side (by the AFTER INSERT trigger on `sales` via pg_net — see
// migration 0003) with a JSON body { "sale_id": "<uuid>" }. Looks up the sale +
// customer phone using the service role and sends the approved receipt template.
//
// Nothing is shown in the frontend; if the customer has no phone, or WhatsApp is
// not configured, it simply skips.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorized, sendTemplate, toPakE164 } from '../_shared/whatsapp.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 })

  const { sale_id } = await req.json().catch(() => ({ sale_id: null }))
  if (!sale_id) return json({ error: 'sale_id required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: sale, error } = await supabase
    .from('sales')
    .select('invoice_no, total, paid, due, date, customer:customers(name, phone)')
    .eq('id', sale_id)
    .single()

  if (error || !sale) return json({ error: 'sale not found' }, 404)

  const customer = sale.customer as { name?: string; phone?: string } | null
  if (!customer?.phone) return json({ skipped: 'no_customer_phone' }, 200)

  const result = await sendTemplate({
    to: toPakE164(customer.phone),
    template: Deno.env.get('WHATSAPP_RECEIPT_TEMPLATE') ?? 'sale_receipt',
    // Template body params, in order. Your approved template must match this
    // shape, e.g.: "Thank you {{1}}. Invoice {{2}}: total Rs {{3}}, balance Rs {{4}}."
    bodyParams: [
      customer.name ?? 'Customer',
      sale.invoice_no,
      String(sale.total),
      String(sale.due),
    ],
  })

  return json(result, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
