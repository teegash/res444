import { NextRequest, NextResponse } from 'next/server'
import { normalizeUuid, requireManagerContext, notifyTenant } from '../../_helpers'

export async function POST(req: NextRequest, ctx: { params: { caseId: string } }) {
  const caseId = normalizeUuid(`${ctx.params.caseId} ${req.nextUrl.pathname}`)
  if (!caseId) return NextResponse.json({ success: false, error: 'Invalid case id.' }, { status: 400 })

  const auth = await requireManagerContext()
  if ((auth as any).error) return (auth as any).error

  try {
    const { admin, organizationId, user } = auth as any
    const body = await req.json().catch(() => ({}))

    const unitNextStatus = String(body.unit_next_status || 'vacant')
    const actualVacateDate =
      body.actual_vacate_date || new Date().toISOString().slice(0, 10)

    const { data: row, error: rErr } = await admin
      .from('tenant_transition_cases')
      .select('id, tenant_user_id, vacate_notice_id, lease_id')
      .eq('organization_id', organizationId)
      .eq('id', caseId)
      .maybeSingle()

    if (rErr) throw rErr
    if (!row) return NextResponse.json({ success: false, error: 'Case not found.' }, { status: 404 })

    const { error: rpcErr } = await admin.rpc('complete_transition_case', {
      p_case_id: caseId,
      p_unit_next_status: unitNextStatus,
      p_actual_vacate_date: actualVacateDate,
    })

    if (rpcErr) throw rpcErr

    let vacateNoticeId = row.vacate_notice_id ? String(row.vacate_notice_id) : ''

    if (!vacateNoticeId && row.lease_id) {
      const { data: notice } = await admin
        .from('tenant_vacate_notices')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('lease_id', row.lease_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (notice?.id) vacateNoticeId = String(notice.id)
    }

    if (vacateNoticeId) {
      const { error: noticeErr } = await admin.rpc('complete_vacate_notice', {
        p_notice_id: vacateNoticeId,
        p_completed_by: user?.id || null,
      })

      if (noticeErr) {
        await admin
          .from('tenant_vacate_notices')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('id', vacateNoticeId)

        await admin.from('tenant_vacate_notice_events').insert({
          notice_id: vacateNoticeId,
          organization_id: organizationId,
          actor_user_id: user?.id || null,
          action: 'completed',
          metadata: {
            source: 'transition_case',
            case_id: caseId,
            note: noticeErr.message || 'complete_vacate_notice failed; status updated directly',
          },
        })
      }
    }

    try {
      await notifyTenant(admin, {
        tenantUserId: row.tenant_user_id,
        organizationId,
        caseId,
        senderUserId: user?.id || null,
        message:
          'Your move-out case has been completed. If any deposit refund is pending, management will process it according to the settlement record.',
      })
    } catch {
      // ignore notification errors
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[TenantTransitions.Complete.POST] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to complete transition case.' },
      { status: 500 }
    )
  }
}
