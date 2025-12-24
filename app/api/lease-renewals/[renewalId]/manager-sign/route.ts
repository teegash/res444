import { NextResponse } from 'next/server'
import { getManagerContext } from '@/lib/lease-renewals/auth'
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
    const ctx = await getManagerContext()
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

    if ((renewal as any).status !== 'tenant_signed') {
      return NextResponse.json(
        { success: false, error: `Invalid status for manager signing: ${(renewal as any).status}` },
        { status: 409 }
      )
    }

    const tenantSignedPath = (renewal as any).pdf_tenant_signed_path as string | null
    if (!tenantSignedPath) {
      return NextResponse.json({ success: false, error: 'Missing tenant-signed PDF.' }, { status: 400 })
    }

    const { data: dl, error: dlErr } = await admin.storage.from('lease-renewals').download(tenantSignedPath)
    if (dlErr) throw dlErr
    const pdfBuffer = Buffer.from(await dl.arrayBuffer())

    const managerCert = readP12FromEnv('MANAGER')
    if (!managerCert) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Missing manager signing certificate env vars. Set MANAGER_P12_BASE64 and MANAGER_CERT_PASSWORD.',
        },
        { status: 500 }
      )
    }

    const fullySignedPdf = await signPdfWithP12({
      pdfBuffer,
      p12Buffer: managerCert.p12Buffer,
      passphrase: managerCert.password,
      reason: 'Lease renewal - landlord/manager countersign',
      fieldName: 'ManagerSignature',
      signatureLength: 8192,
    })

    const fullySignedPath = replaceFilename(tenantSignedPath, 'fully_signed.pdf')
    const { error: upErr } = await admin.storage
      .from('lease-renewals')
      .upload(fullySignedPath, new Blob([fullySignedPdf], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (upErr) throw upErr

    const nowIso = new Date().toISOString()
    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_fully_signed_path: fullySignedPath,
        manager_signed_at: nowIso,
        status: 'completed',
        updated_at: nowIso,
      })
      .eq('id', renewalId)
      .eq('status', 'tenant_signed')

    if (updErr) throw updErr

    const audit = getRequestAuditMeta(req)
    await logLeaseRenewalEvent(admin as any, {
      renewalId,
      organizationId: orgId,
      actorUserId: userId,
      action: 'manager_signed_and_completed',
      metadata: { fullySignedPath },
      ip: audit.ip,
      userAgent: audit.userAgent,
    })

    return NextResponse.json({ success: true, data: { renewalId, fullySignedPath } })
  } catch (error) {
    console.error('[LeaseRenewalManagerSign] Failed to countersign renewal', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to countersign renewal.' },
      { status: 500 }
    )
  }
}

