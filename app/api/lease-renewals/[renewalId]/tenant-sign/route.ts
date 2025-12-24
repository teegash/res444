import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/internalApiAuth'
import { requireActorUserId, requireOrgRole } from '@/lib/actorRole'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { downloadPdf, tenantSignedPathFromUnsigned, uploadPdf } from '@/lib/leaseRenewalStorage'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'
import { signPdfIncrementally } from '@/lib/leaseRenewalSigning'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req)
    const actorUserId = requireActorUserId(req)

    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (rErr) return NextResponse.json({ success: false, error: rErr.message }, { status: 400 })

    if (actorUserId !== renewal.tenant_user_id) {
      return NextResponse.json({ success: false, error: 'Forbidden: not the tenant on this renewal' }, { status: 403 })
    }

    await requireOrgRole({
      actorUserId,
      organizationId: renewal.organization_id,
      allowedRoles: ['tenant'],
    })

    if (renewal.status !== 'sent_to_tenant') {
      return NextResponse.json(
        { success: false, error: `Invalid status for tenant signing: ${renewal.status}` },
        { status: 409 }
      )
    }
    if (!renewal.pdf_unsigned_path) return NextResponse.json({ success: false, error: 'Missing unsigned PDF' }, { status: 400 })

    const pdfBuffer = await downloadPdf(renewal.pdf_unsigned_path)
    const signedPdf = await signPdfIncrementally({
      pdfBuffer,
      kind: 'TENANT',
      reason: 'Lease renewal - tenant signing',
    })

    const tenantSignedPath = tenantSignedPathFromUnsigned(renewal.pdf_unsigned_path)
    await uploadPdf(tenantSignedPath, signedPdf)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_tenant_signed_path: tenantSignedPath,
        tenant_signed_at: new Date().toISOString(),
        status: 'tenant_signed',
      })
      .eq('id', renewalId)

    if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 400 })

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actorUserId,
      action: 'tenant_signed',
      metadata: { tenantSignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ success: true, data: { tenantSignedPath } })
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
