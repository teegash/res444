import { NextResponse } from 'next/server'
import { fetchNoticeById, logNoticeEvent, notifyTenant, requireManagerContext, UUID_RE } from '../../_helpers'

export async function POST(request: Request, { params }: { params: { noticeId: string } }) {
  const noticeId = params?.noticeId || ''
  if (!UUID_RE.test(noticeId)) {
    return NextResponse.json({ success: false, error: 'Invalid notice id.' }, { status: 400 })
  }

  const auth = await requireManagerContext()
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const managerNotes = typeof body?.manager_notes === 'string' ? body.manager_notes.trim() : ''

    if (!managerNotes) {
      return NextResponse.json({ success: false, error: 'Rejection reason is required.' }, { status: 400 })
    }

    const { admin, organizationId, user } = auth as any
    const notice = await fetchNoticeById(admin, organizationId, noticeId)

    if (!notice) {
      return NextResponse.json({ success: false, error: 'Notice not found.' }, { status: 404 })
    }

    const status = String(notice.status || '').toLowerCase()
    if (!['submitted', 'acknowledged'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Notice is not in a rejectable state.' },
        { status: 400 }
      )
    }

    const { error: updateError } = await admin
      .from('tenant_vacate_notices')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        manager_notes: managerNotes,
      })
      .eq('id', noticeId)
      .eq('organization_id', organizationId)

    if (updateError) throw updateError

    await logNoticeEvent(admin, {
      notice_id: noticeId,
      organization_id: organizationId,
      actor_user_id: user.id,
      action: 'rejected',
      metadata: { reason: managerNotes },
    })

    await notifyTenant(admin, {
      tenantUserId: notice.tenant_user_id,
      organizationId,
      noticeId,
      senderUserId: user.id,
      message: `Your vacate notice was rejected: ${managerNotes}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[VacateNotice.Reject] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to reject notice.' },
      { status: 500 }
    )
  }
}
