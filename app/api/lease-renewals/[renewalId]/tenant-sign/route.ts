import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/lease-renewals/auth'
import { getRequestAuditMeta, logLeaseRenewalEvent } from '@/lib/lease-renewals/audit'
import { readP12FromEnv, signPdfWithP12 } from '@/lib/lease-renewals/signing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function replaceFilename(path: string, filename: string) {
  const parts = path.split('/')
  parts[parts.length - 1] = filename
  return parts.join('/')
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const ctx = await getTenantContext()
    if ('error' in ctx) return ctx.error

    const { admin, orgId, userId } = ctx
    const renewalId = params.renewalId
    if (!renewalId) {
      return NextResponse.json({ success: false, error: 'Renewal id is required.' }, { status: 400 })
    }

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (rErr) throw rErr
    if (!renewal) {
      return NextResponse.json({ success: false, error: 'Renewal not found.' }, { status: 404 })
    }

    if ((renewal as any).tenant_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    if ((renewal as any).status !== 'sent_to_tenant') {
      return NextResponse.json(
        { success: false, error: `Invalid status for tenant signing: ${(renewal as any).status}` },
        { status: 409 }
      )
    }

    const unsignedPath = (renewal as any).pdf_unsigned_path as string | null
    if (!unsignedPath) {
      return NextResponse.json({ success: false, error: 'Missing unsigned PDF.' }, { status: 400 })
    }

    const { data: dl, error: dlErr } = await admin.storage.from('lease-renewals').download(unsignedPath)
    if (dlErr) throw dlErr
    const pdfBuffer = Buffer.from(await dl.arrayBuffer())

    const tenantCert = readP12FromEnv('TENANT')
    if (!tenantCert) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing tenant signing certificate env vars. Set TENANT_P12_BASE64 and TENANT_CERT_PASSWORD.',
        },
        { status: 500 }
      )
    }

    const signedPdf = await signPdfWithP12({
      pdfBuffer,
      p12Buffer: tenantCert.p12Buffer,
      passphrase: tenantCert.password,
      reason: 'Lease renewal - tenant signing',
      fieldName: 'TenantSignature',
      signatureLength: 8192,
    })

    const tenantSignedPath = replaceFilename(unsignedPath, 'tenant_signed.pdf')
    const { error: upErr } = await admin.storage
      .from('lease-renewals')
      .upload(tenantSignedPath, new Blob([signedPdf], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (upErr) throw upErr

    const nowIso = new Date().toISOString()
    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_tenant_signed_path: tenantSignedPath,
        tenant_signed_at: nowIso,
        status: 'tenant_signed',
        updated_at: nowIso,
      })
      .eq('id', renewalId)
      .eq('status', 'sent_to_tenant')

    if (updErr) throw updErr

    const audit = getRequestAuditMeta(req)
    await logLeaseRenewalEvent(admin as any, {
      renewalId,
      organizationId: orgId,
      actorUserId: userId,
      action: 'tenant_signed',
      metadata: { tenantSignedPath },
      ip: audit.ip,
      userAgent: audit.userAgent,
    })

    return NextResponse.json({ success: true, data: { renewalId, tenantSignedPath } })
  } catch (error) {
    console.error('[LeaseRenewalTenantSign] Failed to sign renewal', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sign renewal.' },
      { status: 500 }
    )
  }
}

