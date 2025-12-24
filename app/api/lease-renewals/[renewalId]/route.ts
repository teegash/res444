import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSupabaseUserFromCookies } from '@/lib/supabaseCookieAuth'
import { requireOrgRole } from '@/lib/requireOrgRole'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const actor = await requireSupabaseUserFromCookies()
    const admin = supabaseAdmin()
    const renewalId = params.renewalId

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const isTenant = renewal.tenant_user_id === actor.id
    if (!isTenant) {
      await requireOrgRole(actor.id, renewal.organization_id, ['admin', 'manager'])
    } else {
      await requireOrgRole(actor.id, renewal.organization_id, ['tenant'])
    }

    const { data: events } = await admin
      .from('lease_renewal_events')
      .select('action, metadata, actor_user_id, created_at')
      .eq('renewal_id', renewalId)
      .order('created_at', { ascending: true })

    return NextResponse.json({ ok: true, renewal, events: events ?? [] })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

