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

    const { data: row, error: rErr } = await admin
      .from('tenant_transition_cases')
      .select('id, tenant_user_id')
      .eq('organization_id', organizationId)
      .eq('id', caseId)
      .maybeSingle()

    if (rErr) throw rErr
    if (!row) return NextResponse.json({ success: false, error: 'Case not found.' }, { status: 404 })

    const { error: rpcErr } = await admin.rpc('update_transition_case', {
      p_case_id: caseId,
      p_status: body.status ?? null,
      p_stage: body.stage ?? null,
      p_expected_vacate_date: body.expected_vacate_date ?? null,
      p_handover_date: body.handover_date ?? null,
      p_actual_vacate_date: body.actual_vacate_date ?? null,
      p_inspection_notes: body.inspection_notes ?? null,
      p_damage_cost: body.damage_cost ?? null,
      p_deposit_amount: body.deposit_amount ?? null,
      p_deposit_deductions: body.deposit_deductions ?? null,
      p_refund_status: body.refund_status ?? null,
      p_notice_document_url: body.notice_document_url ?? null,
      p_inspection_report_url: body.inspection_report_url ?? null,
      p_settlement_statement_url: body.settlement_statement_url ?? null,
      p_new_lease_id: body.new_lease_id ?? null,
    })

    if (rpcErr) throw rpcErr

    const notifyMessage = body.notify_message ? String(body.notify_message).trim() : ''
    if (notifyMessage) {
      try {
        await notifyTenant(admin, {
          tenantUserId: row.tenant_user_id,
          organizationId,
          caseId,
          senderUserId: user?.id || null,
          message: notifyMessage,
        })
      } catch {
        // ignore notification errors
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[TenantTransitions.Update.POST] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to update transition case.' },
      { status: 500 }
    )
  }
}
