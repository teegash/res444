import { NextResponse } from 'next/server'
import { fetchNoticeById, notifyTenant, requireManagerContext, normalizeUuid } from '../../_helpers'

export async function POST(request: Request, { params }: { params: { noticeId?: string; id?: string } }) {
  const rawParam = params?.noticeId || params?.id || ''
  const url = new URL(request.url)
  const noticeId =
    normalizeUuid(
      `${rawParam} ${url.pathname} ${url.searchParams.get('noticeId') || ''} ${url.searchParams.get('id') || ''}`
    ) || normalizeUuid(rawParam)
  if (!noticeId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid notice id.',
        received: {
          param: rawParam || null,
          path: url.pathname,
          query: url.searchParams.get('noticeId') || null,
        },
      },
      { status: 400 }
    )
  }

  const auth = await requireManagerContext()
  if (auth.error) return auth.error

  try {
    const { admin, organizationId, user } = auth as any
    const notice = await fetchNoticeById(admin, organizationId, noticeId)

    if (!notice) {
      return NextResponse.json({ success: false, error: 'Notice not found.' }, { status: 404 })
    }

    const status = String(notice.status || '').toLowerCase()
    if (status !== 'approved') {
      return NextResponse.json(
        { success: false, error: 'Notice must be approved before completion.' },
        { status: 400 }
      )
    }

    const { error: rpcError } = await admin.rpc('complete_vacate_notice', {
      p_notice_id: noticeId,
      p_completed_by: user?.id || null,
    })

    if (rpcError) throw rpcError

    let transition =
      (
        await admin
          .from('tenant_transition_cases')
          .select('id, status')
          .eq('organization_id', organizationId)
          .eq('vacate_notice_id', noticeId)
          .maybeSingle()
      ).data || null

    if (!transition && notice.lease_id) {
      transition =
        (
          await admin
            .from('tenant_transition_cases')
            .select('id, status')
            .eq('organization_id', organizationId)
            .eq('lease_id', notice.lease_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data || null
    }

    if (transition && transition.status !== 'completed') {
      const { error: transitionErr } = await admin.rpc('complete_transition_case', {
        p_case_id: transition.id,
        p_unit_next_status: 'vacant',
        p_actual_vacate_date: notice.requested_vacate_date || null,
      })

      if (transitionErr) {
        await admin
          .from('tenant_transition_cases')
          .update({
            status: 'completed',
            stage: 'unit_turned_over',
            actual_vacate_date: notice.requested_vacate_date || null,
          })
          .eq('organization_id', organizationId)
          .eq('id', transition.id)

        await admin.from('tenant_transition_events').insert({
          organization_id: organizationId,
          case_id: transition.id,
          actor_user_id: user?.id || null,
          action: 'completed',
          metadata: {
            source: 'vacate_notice',
            notice_id: noticeId,
            note: transitionErr.message || 'complete_transition_case failed; status updated directly',
          },
        })
      }
    }

    await notifyTenant(admin, {
      tenantUserId: notice.tenant_user_id,
      organizationId,
      noticeId,
      senderUserId: user.id,
      message: 'Move-out process completed. Unit marked vacant and lease closed.',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[VacateNotice.Complete] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to complete notice.' },
      { status: 500 }
    )
  }
}
