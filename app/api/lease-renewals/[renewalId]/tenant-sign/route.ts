import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { tenantSignedPathFromUnsigned } from '@/lib/leaseRenewalPaths'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalAudit'
import { requireOrgRole } from '@/lib/orgAccess'
import { signPdfIncrementally } from '@/lib/leaseRenewalSigning'
import { downloadPdfFromLeaseRenewals, supabaseAdmin, uploadPdfToLeaseRenewals } from '@/lib/storageAdmin'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('id, organization_id, tenant_user_id, status, pdf_unsigned_path')
      .eq('id', renewalId)
      .maybeSingle()

    if (rErr) return NextResponse.json({ success: false, error: rErr.message }, { status: 400 })
    if (!renewal) return NextResponse.json({ success: false, error: 'Renewal not found.' }, { status: 404 })

    if (renewal.tenant_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await requireOrgRole(user.id, renewal.organization_id, ['tenant'])

    if (renewal.status !== 'sent_to_tenant') {
      return NextResponse.json(
        { success: false, error: `Invalid status for tenant signing: ${renewal.status}` },
        { status: 409 }
      )
    }

    if (!renewal.pdf_unsigned_path) {
      return NextResponse.json({ success: false, error: 'Missing unsigned PDF.' }, { status: 400 })
    }

    const pdfBuffer = await downloadPdfFromLeaseRenewals(renewal.pdf_unsigned_path)
    const signedPdf = await signPdfIncrementally({
      pdfBuffer,
      kind: 'TENANT',
      reason: 'Lease renewal - tenant signing',
    })

    const tenantSignedPath = tenantSignedPathFromUnsigned(renewal.pdf_unsigned_path)
    await uploadPdfToLeaseRenewals(tenantSignedPath, signedPdf)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_tenant_signed_path: tenantSignedPath,
        tenant_signed_at: new Date().toISOString(),
        status: 'tenant_signed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', renewalId)

    if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 400 })

    await logLeaseRenewalEvent(admin, {
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: user.id,
      action: 'tenant_signed',
      metadata: { tenantSignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ success: true, data: { tenantSignedPath } })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}

