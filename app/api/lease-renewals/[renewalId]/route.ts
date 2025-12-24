import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin } from '@/lib/storageAdmin'
import { requireOrgRole } from '@/lib/orgAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const isTenant = (renewal as any).tenant_user_id === user.id
    let isManager = false

    if (!isTenant) {
      await requireOrgRole(user.id, (renewal as any).organization_id, ['admin', 'manager'])
      isManager = true
    }

    const { data: events } = await admin
      .from('lease_renewal_events')
      .select('action, metadata, actor_user_id, created_at')
      .eq('renewal_id', renewalId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      ok: true,
      renewal,
      events: events ?? [],
      access: { isTenant, isManager },
    })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

