import { NextResponse } from 'next/server'
import { fetchNoticeById, logNoticeEvent, notifyTenant, requireManagerContext, normalizeUuid } from '../../_helpers'

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
    if (status !== 'submitted') {
      return NextResponse.json(
        { success: false, error: 'Notice is not in a submitted state.' },
        { status: 400 }
      )
    }

    const { error: updateError } = await admin
      .from('tenant_vacate_notices')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', noticeId)
      .eq('organization_id', organizationId)

    if (updateError) throw updateError

    await logNoticeEvent(admin, {
      notice_id: noticeId,
      organization_id: organizationId,
      actor_user_id: user.id,
      action: 'acknowledged',
    })

    await notifyTenant(admin, {
      tenantUserId: notice.tenant_user_id,
      organizationId,
      noticeId,
      senderUserId: user.id,
      message: 'Your vacate notice has been reviewed by management.',
    })

    let transition =
      (
        await admin
          .from('tenant_transition_cases')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('vacate_notice_id', noticeId)
          .maybeSingle()
      ).data || null

    if (!transition && notice.lease_id) {
      transition =
        (
          await admin
            .from('tenant_transition_cases')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('lease_id', notice.lease_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data || null
    }

    if (transition?.id) {
      const { error: transitionErr } = await admin.rpc('update_transition_case', {
        p_case_id: transition.id,
        p_status: 'acknowledged',
      })

      if (transitionErr) {
        await admin
          .from('tenant_transition_cases')
          .update({ status: 'acknowledged' })
          .eq('organization_id', organizationId)
          .eq('id', transition.id)

        await admin.from('tenant_transition_events').insert({
          organization_id: organizationId,
          case_id: transition.id,
          actor_user_id: user?.id || null,
          action: 'acknowledged',
          metadata: { source: 'vacate_notice', notice_id: noticeId },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[VacateNotice.Acknowledge] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to acknowledge notice.' },
      { status: 500 }
    )
  }
}
