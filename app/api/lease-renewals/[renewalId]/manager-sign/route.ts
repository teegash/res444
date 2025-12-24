import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireInternalApiKey } from '@/lib/internalApiAuth'
import { downloadPdf, fullySignedPathFromTenant, uploadPdf } from '@/lib/leaseRenewalStorage'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'
import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'

export const runtime = 'nodejs'

function readManagerSignerFromEnv() {
  const p12base64 = process.env.MANAGER_P12_BASE64
  const pass = process.env.MANAGER_CERT_PASSWORD
  if (!p12base64 || !pass) {
    throw new Error('Missing MANAGER_P12_BASE64 or MANAGER_CERT_PASSWORD env vars')
  }
  return { p12Buffer: Buffer.from(p12base64, 'base64'), passphrase: pass }
}

async function cancelPendingLeaseRenewalReminders(admin: any, renewalId: string) {
  const { data: r, error: rErr } = await admin.from('lease_renewals').select('lease_id').eq('id', renewalId).single()
  if (rErr) throw new Error(rErr.message)

  const leaseId = r.lease_id

  const { error: updErr } = await admin
    .from('reminders')
    .update({
      delivery_status: 'failed',
      last_error: 'Cancelled: renewal completed',
    })
    .eq('reminder_type', 'lease_renewal')
    .eq('related_entity_type', 'lease')
    .eq('related_entity_id', leaseId)
    .in('delivery_status', ['pending', 'processing'])

  if (updErr) throw new Error(updErr.message)
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req)

    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin.from('lease_renewals').select('*').eq('id', renewalId).single()
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

    if (renewal.status !== 'tenant_signed') {
      return NextResponse.json({ error: `Invalid status for manager signing: ${renewal.status}` }, { status: 409 })
    }
    if (!renewal.pdf_tenant_signed_path) {
      return NextResponse.json({ error: 'Missing tenant-signed PDF' }, { status: 400 })
    }

    const pdfBuffer = await downloadPdf(renewal.pdf_tenant_signed_path)

    const { p12Buffer, passphrase } = readManagerSignerFromEnv()
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: 'Lease renewal - landlord/manager countersign',
      signatureLength: 8192,
    })

    const signer = new P12Signer(p12Buffer, { passphrase })
    const signpdf = new SignPdf()
    const fullySignedPdf = await signpdf.sign(pdfWithPlaceholder, signer)

    const fullySignedPath = fullySignedPathFromTenant(renewal.pdf_tenant_signed_path)
    await uploadPdf(fullySignedPath, fullySignedPdf as any)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_fully_signed_path: fullySignedPath,
        manager_signed_at: new Date().toISOString(),
        status: 'completed',
      })
      .eq('id', renewalId)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await cancelPendingLeaseRenewalReminders(admin, renewalId)

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: null,
      action: 'manager_signed_and_completed',
      metadata: { fullySignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, fullySignedPath })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

