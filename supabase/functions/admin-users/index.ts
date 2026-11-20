// Admin-only staff account management. Runs server-side with the service-role key,
// which must never reach the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Only operator logins are created here; barbers have no login (save_barber RPC) and the admin is never created.
const ROLES = ['operator']

type Body =
  | { action: 'create'; email: string; password: string; name: string; role: string; phone?: string }
  | { action: 'update'; id: string; email?: string; password?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'unauthorized' }, 401)
  const { data: me } = await admin.from('staff').select('role, active').eq('id', caller.user.id).maybeSingle()
  if (me?.role !== 'admin' || !me.active) return json({ error: 'forbidden' }, 403)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_input' }, 400)
  }

  if (body.action === 'create') {
    const email = body.email?.trim().toLowerCase()
    const name = body.name?.trim()
    if (!email || !EMAIL.test(email) || (body.password ?? '').length < 6 || !name || !ROLES.includes(body.role)) return json({ error: 'invalid_input' }, 400)
    const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true })
    if (error || !data.user) return json({ error: error?.message.toLowerCase().includes('already') ? 'email_taken' : 'create_failed' }, 400)
    const { error: rowError } = await admin.from('staff').insert({
      id: data.user.id,
      email,
      name,
      role: body.role,
      phone: (body.phone ?? '').replace(/[\s-]/g, ''),
    })
    if (rowError) {
      // Keep auth users and staff rows in step: undo the login if the profile could not be saved.
      await admin.auth.admin.deleteUser(data.user.id)
      return json({ error: 'create_failed' }, 500)
    }
    return json({ id: data.user.id })
  }

  if (body.action === 'update') {
    const { data: target } = await admin.from('staff').select('id').eq('id', body.id).maybeSingle()
    if (!target) return json({ error: 'not_found' }, 404)
    const email = body.email?.trim().toLowerCase()
    if (email !== undefined && !EMAIL.test(email)) return json({ error: 'invalid_input' }, 400)
    if (body.password !== undefined && body.password.length < 6) return json({ error: 'invalid_input' }, 400)
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      ...(email ? { email, email_confirm: true } : {}),
      ...(body.password ? { password: body.password } : {}),
    })
    if (error) return json({ error: error.message.toLowerCase().includes('already') ? 'email_taken' : 'update_failed' }, 400)
    if (email) await admin.from('staff').update({ email }).eq('id', body.id)
    return json({ ok: true })
  }

  return json({ error: 'invalid_input' }, 400)
})
