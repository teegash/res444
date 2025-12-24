import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin, downloadPdfFromLeaseRenewals, uploadPdfToLeaseRenewals } from '@/lib/storageAdmin'
import { tenantSignedPathFromUnsigned } from '@/lib/leaseRenewalPaths'
import { readP12FromEnv, signPdfIncrementally } from '@/lib/leaseRenewalSigning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function logEvent(admin: any, args: any) {
  await admin.from('lease_renewal_events').insert({
    renewal_id: args.renewal_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id ?? null,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.user_agent ?? null,
  })
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

    if ((renewal as any).tenant_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if ((renewal as any).status !== 'sent_to_tenant') {
      return NextResponse.json({ error: `Invalid status for tenant signing: ${(renewal as any).status}` }, { status: 409 })
    }

    if (!(renewal as any).pdf_unsigned_path) {
      return NextResponse.json({ error: 'Missing unsigned PDF' }, { status: 400 })
    }

    const pdfBuffer = await downloadPdfFromLeaseRenewals((renewal as any).pdf_unsigned_path)

    const tenantCert = readP12FromEnv('TENANT')
    if (!tenantCert) {
      return NextResponse.json({ error: 'Missing TENANT_P12_BASE64 or TENANT_CERT_PASSWORD' }, { status: 500 })
    }

    const signedPdf = await signPdfIncrementally({
      pdfBuffer,
      p12Buffer: tenantCert.p12Buffer,
      passphrase: tenantCert.password,
      reason: 'Lease renewal - tenant signing',
      fieldName: 'TenantSignature',
      signatureLength: 8192,
    })

    const tenantSignedPath = tenantSignedPathFromUnsigned((renewal as any).pdf_unsigned_path)
    await uploadPdfToLeaseRenewals(tenantSignedPath, signedPdf)

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

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await logEvent(admin, {
      renewal_id: renewalId,
      organization_id: (renewal as any).organization_id,
      actor_user_id: user.id,
      action: 'tenant_signed',
      metadata: { tenantSignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, tenantSignedPath })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

