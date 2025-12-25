import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireInternalApiKey } from '@/lib/internalApiAuth'
import { requireActorUserId } from '@/lib/actorRole'
import { downloadPdf, uploadPdf, tenantSignedPathFromUnsigned } from '@/lib/leaseRenewalStorage'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'

import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'

export const runtime = 'nodejs'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req)
    const actorUserId = requireActorUserId(req)

    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin.from('lease_renewals').select('*').eq('id', renewalId).single()

    if (rErr) return jsonError(rErr.message, 400)

    if (renewal.tenant_user_id !== actorUserId) {
      return jsonError('Forbidden: only the tenant can sign this renewal.', 403)
    }

    if (renewal.status === 'tenant_signed' || renewal.status === 'completed') {
      return NextResponse.json({
        ok: true,
        alreadySigned: true,
        tenantSignedPath: renewal.pdf_tenant_signed_path ?? null,
        status: renewal.status,
      })
    }

    if (renewal.status !== 'sent_to_tenant') {
      return jsonError(`Invalid status for tenant signing: ${renewal.status}`, 409)
    }

    if (!renewal.pdf_unsigned_path) {
      return jsonError('Missing unsigned PDF', 400)
    }

    const p12base64 = process.env.TENANT_P12_BASE64 || process.env.TENANT_SIGN_P12_BASE64
    const p12pass = process.env.TENANT_CERT_PASSWORD || process.env.TENANT_SIGN_P12_PASSWORD
    if (!p12base64 || !p12pass) {
      return jsonError('Missing tenant signing env vars (TENANT_P12_BASE64 + TENANT_CERT_PASSWORD)', 500)
    }

    const pdfBuffer = await downloadPdf(renewal.pdf_unsigned_path)
    const p12Buffer = Buffer.from(p12base64, 'base64')

    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: 'Lease renewal - tenant signing',
      signatureLength: 8192,
    })

    const signer = new P12Signer(p12Buffer, { passphrase: p12pass })
    const signpdf = new SignPdf()

    let signedPdf: Buffer
    try {
      signedPdf = await signpdf.sign(pdfWithPlaceholder, signer)
    } catch (e: any) {
      return jsonError(`Signing failed (tenant): ${e?.message ?? String(e)}`, 500)
    }

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

    if (updErr) return jsonError(updErr.message, 400)

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actorUserId,
      action: 'tenant_signed',
      metadata: { tenantSignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, tenantSignedPath })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status =
      msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : msg.startsWith('Missing x-actor-user-id') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
