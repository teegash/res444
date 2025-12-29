import { NextResponse } from 'next/server'
import { requireManagerContext, UUID_RE } from '../../_helpers'

export async function GET(request: Request, { params }: { params: { leaseId: string } }) {
  const rawParam = params?.leaseId || ''
  const url = new URL(request.url)
  const fromPath = url.pathname.split('/').filter(Boolean).pop() || ''
  const decoded = decodeURIComponent(rawParam || fromPath).trim()
  const match = decoded.match(UUID_RE)
  const leaseId = match ? match[0] : ''

  if (!leaseId) {
    return NextResponse.json({ success: false, error: 'Invalid lease id.' }, { status: 400 })
  }

  const auth = await requireManagerContext()
  if (auth.error) return auth.error

  try {
    const { admin, organizationId } = auth as any

    const { data: notice } = await admin
      .from('tenant_vacate_notices')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('lease_id', leaseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!notice) {
      return NextResponse.json({ success: true, notice: null, events: [] })
    }

    const { data: events } = await admin
      .from('tenant_vacate_notice_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('notice_id', notice.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ success: true, notice, events: events || [] })
  } catch (error) {
    console.error('[VacateNotices.ByLease] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load vacate notice.' },
      { status: 500 }
    )
  }
}
