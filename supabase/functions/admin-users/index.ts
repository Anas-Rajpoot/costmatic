// Admin-only user management (create / delete staff accounts).
//
// Runs with the service role so it can create *confirmed* accounts (no email
// verification needed) and delete users. The caller must be a signed-in admin —
// verified here from their JWT, so an employee can't reach it even via the API.
//
// Called from the app with supabase.functions.invoke('admin-users', { body: {...} }).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: uErr } = await caller.auth.getUser()
  if (uErr || !user) return json({ error: 'unauthorized' }, 401)

  // Confirm the caller is an admin (service client bypasses RLS).
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: prof } = await admin.from('users').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => ({}))

  // ── Create a confirmed staff account ──
  if (body.action === 'create') {
    const { email, password, full_name, role, discount_limit } = body
    if (!email || !password || String(password).length < 6) {
      return json({ error: 'invalid_input' }, 400)
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // usable immediately, no email verification
      user_metadata: { full_name },
    })
    if (error) return json({ error: error.message }, 400)

    const newId = data.user!.id
    const { error: ue } = await admin.from('users').update({
      full_name: full_name ?? '',
      role: role === 'admin' ? 'admin' : 'employee',
      discount_limit: role === 'admin' ? 0 : Number(discount_limit) || 0,
    }).eq('id', newId)
    if (ue) return json({ error: ue.message }, 400)

    return json({ ok: true, id: newId }, 200)
  }

  // ── Delete a staff account ──
  if (body.action === 'delete') {
    const { id } = body
    if (!id) return json({ error: 'id_required' }, 400)
    if (id === user.id) return json({ error: 'cannot_delete_self' }, 400)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true }, 200)
  }

  return json({ error: 'unknown_action' }, 400)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
