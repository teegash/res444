import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { requireOrgRole } from '@/lib/orgAccess'
import { createSignedUrlLeaseRenewals, supabaseAdmin } from '@/lib/storageAdmin'

export const runtime = 'nodejs'

type DownloadType = 'unsigned' | 'tenant_signed' | 'fully_signed'

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const url = new URL(req.url)
    const type = (url.searchParams.get('type') || 'fully_signed') as DownloadType

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('id', renewalId)
      .maybeSingle()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    if (!renewal) return NextResponse.json({ success: false, error: 'Renewal not found.' }, { status: 404 })

    const isTenant = renewal.tenant_user_id === user.id
    if (isTenant) {
      await requireOrgRole(user.id, renewal.organization_id, ['tenant'])
    } else {
      await requireOrgRole(user.id, renewal.organization_id, ['admin', 'manager'])
    }

    let path: string | null = null
    if (type === 'unsigned') path = renewal.pdf_unsigned_path
    if (type === 'tenant_signed') path = renewal.pdf_tenant_signed_path
    if (type === 'fully_signed') path = renewal.pdf_fully_signed_path

    if (!path) return NextResponse.json({ success: false, error: 'File not available.' }, { status: 404 })

    const signedUrl = await createSignedUrlLeaseRenewals(path, 60)
    return NextResponse.json({ success: true, data: { url: signedUrl } })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}

