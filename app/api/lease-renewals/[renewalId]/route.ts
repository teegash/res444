import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { requireOrgRole } from '@/lib/orgAccess'
import { supabaseAdmin } from '@/lib/storageAdmin'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .maybeSingle()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    if (!renewal) return NextResponse.json({ success: false, error: 'Renewal not found.' }, { status: 404 })

    const isTenant = renewal.tenant_user_id === user.id
    if (isTenant) {
      await requireOrgRole(user.id, renewal.organization_id, ['tenant'])
    } else {
      await requireOrgRole(user.id, renewal.organization_id, ['admin', 'manager'])
    }

    const { data: events } = await admin
      .from('lease_renewal_events')
      .select('action, metadata, actor_user_id, created_at')
      .eq('renewal_id', renewalId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      success: true,
      data: { renewal, events: events ?? [], access: { isTenant, isManager: !isTenant } },
    })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}

