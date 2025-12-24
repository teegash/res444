import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/internalApiAuth'
import { requireActorUserId, requireOrgRole } from '@/lib/actorRole'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedUrl } from '@/lib/leaseRenewalStorage'

export const runtime = 'nodejs'

type DownloadType = 'unsigned' | 'tenant_signed' | 'fully_signed'

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req)
    const actorUserId = requireActorUserId(req)

    const renewalId = params.renewalId
    const admin = supabaseAdmin()
    const url = new URL(req.url)
    const type = (url.searchParams.get('type') || 'fully_signed') as DownloadType

    const { data: renewal, error } = await admin
      .from('lease_renewals')
      .select('organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('id', renewalId)
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    if (actorUserId === renewal.tenant_user_id) {
      await requireOrgRole({
        actorUserId,
        organizationId: renewal.organization_id,
        allowedRoles: ['tenant'],
      })
    } else {
      await requireOrgRole({
        actorUserId,
        organizationId: renewal.organization_id,
        allowedRoles: ['admin', 'manager'],
      })
    }

    let path: string | null = null
    if (type === 'unsigned') path = renewal.pdf_unsigned_path
    if (type === 'tenant_signed') path = renewal.pdf_tenant_signed_path
    if (type === 'fully_signed') path = renewal.pdf_fully_signed_path

    if (!path) return NextResponse.json({ success: false, error: 'File not available.' }, { status: 404 })

    const signedUrl = await createSignedUrl(path, 60)
    return NextResponse.json({ success: true, data: { url: signedUrl } })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden' || String(msg).startsWith('Forbidden')
          ? 403
          : String(msg).startsWith('Missing')
            ? 400
            : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
