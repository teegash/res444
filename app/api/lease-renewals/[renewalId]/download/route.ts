import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSupabaseUserFromCookies } from '@/lib/supabaseCookieAuth'
import { requireOrgRole } from '@/lib/requireOrgRole'
import { createSignedUrl } from '@/lib/leaseRenewalStorage'

export const runtime = 'nodejs'

type DownloadType = 'unsigned' | 'tenant_signed' | 'fully_signed'

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const actor = await requireSupabaseUserFromCookies()
    const admin = supabaseAdmin()
    const renewalId = params.renewalId

    const url = new URL(req.url)
    const type = (url.searchParams.get('type') || 'fully_signed') as DownloadType

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('id', renewalId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const isTenant = renewal.tenant_user_id === actor.id
    if (isTenant) {
      await requireOrgRole(actor.id, renewal.organization_id, ['tenant'])
    } else {
      await requireOrgRole(actor.id, renewal.organization_id, ['admin', 'manager'])
    }

    let path: string | null = null
    if (type === 'unsigned') path = renewal.pdf_unsigned_path
    if (type === 'tenant_signed') path = renewal.pdf_tenant_signed_path
    if (type === 'fully_signed') path = renewal.pdf_fully_signed_path

    if (!path) return NextResponse.json({ error: 'File not available' }, { status: 404 })

    const signedUrl = await createSignedUrl(path, 60)
    return NextResponse.json({ ok: true, url: signedUrl })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

