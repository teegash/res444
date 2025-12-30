import { NextResponse } from 'next/server'
import { requireManagerContext, normalizeUuid, logTransitionEvent, notifyTenant } from '../_helpers'

export async function POST(request: Request) {
  const auth = await requireManagerContext()
  if ((auth as any).error) return (auth as any).error

  try {
    const { admin, organizationId, user } = auth as any
    const body = await request.json().catch(() => ({}))
    const noticeId = normalizeUuid(String(body.notice_id || body.noticeId || ''))

    if (!noticeId) {
      return NextResponse.json({ success: false, error: 'Invalid notice id.' }, { status: 400 })
    }

    const { data: notice, error: nErr } = await admin
      .from('tenant_vacate_notices')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', noticeId)
      .maybeSingle()

    if (nErr) throw nErr
    if (!notice) return NextResponse.json({ success: false, error: 'Notice not found.' }, { status: 404 })

    const { data: existingCase } = await admin
      .from('tenant_transition_cases')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('tenant_user_id', notice.tenant_user_id)
      .not('status', 'in', '(completed,cancelled,rejected)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingCase?.id) {
      return NextResponse.json(
        { success: false, error: 'Tenant already has an active transition case.' },
        { status: 409 }
      )
    }

    const { data: caseId, error: rpcErr } = await admin.rpc('create_transition_from_vacate_notice', {
      p_notice_id: noticeId,
    })

    if (rpcErr || !caseId) {
      throw rpcErr || new Error('Failed to create transition case.')
    }

    try {
      await logTransitionEvent(admin, {
        organization_id: organizationId,
        case_id: caseId,
        actor_user_id: user?.id || null,
        action: 'submitted',
        metadata: { source: 'vacate_notice', vacate_notice_id: noticeId },
      })
    } catch {
      // ignore log errors
    }

    try {
      await notifyTenant(admin, {
        tenantUserId: notice.tenant_user_id,
        organizationId,
        caseId,
        senderUserId: user?.id || null,
        message:
          'Your move-out case has been opened. Management will schedule handover and inspection steps in the portal.',
      })
    } catch {
      // ignore notification errors
    }

    return NextResponse.json({ success: true, caseId })
  } catch (err) {
    console.error('[TenantTransitions.FromVacateNotice.POST] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to create transition case.' },
      { status: 500 }
    )
  }
}
