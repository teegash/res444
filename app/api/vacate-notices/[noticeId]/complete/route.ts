import { NextResponse } from 'next/server'
import { fetchNoticeById, notifyTenant, requireManagerContext, normalizeUuid } from '../../_helpers'

export async function POST(request: Request, { params }: { params: { noticeId: string } }) {
  const rawParam = params?.noticeId || ''
  const url = new URL(request.url)
  const noticeId =
    normalizeUuid(`${rawParam} ${url.pathname} ${url.searchParams.get('noticeId') || ''}`) ||
    normalizeUuid(rawParam)
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

    let rpcError: any = null
    const primary = await admin.rpc('complete_vacate_notice', { notice_id: noticeId })
    rpcError = primary.error
    if (rpcError) {
      const fallback = await admin.rpc('complete_vacate_notice', { p_notice_id: noticeId })
      rpcError = fallback.error
    }

    if (rpcError) {
      throw rpcError
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
