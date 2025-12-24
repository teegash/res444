import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin } from '@/lib/storageAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser()
    const admin = supabaseAdmin()

    const requestedLeaseId = request.nextUrl.searchParams.get('leaseId')?.trim() || null
    let leaseId = requestedLeaseId

    if (!leaseId) {
      const { data: lease, error: leaseErr } = await admin
        .from('leases')
        .select('id')
        .eq('tenant_user_id', user.id)
        .in('status', ['active', 'pending'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (leaseErr) return NextResponse.json({ error: leaseErr.message }, { status: 400 })
      leaseId = (lease as any)?.id || null
    }

    if (!leaseId) return NextResponse.json({ ok: true, renewal: null })

    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .select('id, status, created_at')
      .eq('lease_id', leaseId)
      .eq('tenant_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (renewErr) return NextResponse.json({ error: renewErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, renewal: renewal || null })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

