import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUuid } from '../../_helpers'

const BUCKET = 'tenant-notices'
const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function GET(request: Request, { params }: { params: { noticeId?: string; id?: string } }) {
  const rawParam = params?.noticeId || params?.id || ''
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

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: notice, error: noticeError } = await admin
      .from('tenant_vacate_notices')
      .select('id, tenant_user_id, organization_id, notice_document_url')
      .eq('id', noticeId)
      .maybeSingle()

    if (noticeError || !notice) {
      return NextResponse.json({ success: false, error: 'Notice not found.' }, { status: 404 })
    }

    const isTenant = notice.tenant_user_id === user.id
    if (!isTenant) {
      const { data: membership } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', notice.organization_id)
        .eq('user_id', user.id)
        .maybeSingle()
      const role = String(membership?.role || user.user_metadata?.role || '').toLowerCase()
      if (!role || !MANAGER_ROLES.has(role)) {
        return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
      }
    }

    if (!notice.notice_document_url) {
      return NextResponse.json({ success: true, url: null })
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(notice.notice_document_url, 60 * 60 * 6)

    if (signedError) {
      return NextResponse.json({ success: false, error: 'Unable to generate download link.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, url: signed?.signedUrl || null })
  } catch (error) {
    console.error('[VacateNotice.Document] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load document.' },
      { status: 500 }
    )
  }
}
