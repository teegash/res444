import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { createSignedUrlLeaseRenewals, supabaseAdmin } from '@/lib/storageAdmin'
import { requireOrgRole } from '@/lib/orgAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'fully_signed' // unsigned|tenant_signed|fully_signed

    const admin = supabaseAdmin()
    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('id, organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('id', renewalId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const isTenant = (renewal as any).tenant_user_id === user.id
    if (!isTenant) {
      await requireOrgRole(user.id, (renewal as any).organization_id, ['admin', 'manager'])
    }

    let path: string | null = null
    if (type === 'unsigned') path = (renewal as any).pdf_unsigned_path
    if (type === 'tenant_signed') path = (renewal as any).pdf_tenant_signed_path
    if (type === 'fully_signed') path = (renewal as any).pdf_fully_signed_path

    if (!path) return NextResponse.json({ error: 'File not available' }, { status: 404 })

    const signedUrl = await createSignedUrlLeaseRenewals(path, 60)
    return NextResponse.json({ ok: true, url: signedUrl })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

