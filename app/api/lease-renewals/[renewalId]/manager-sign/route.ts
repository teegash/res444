import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin, downloadPdfFromLeaseRenewals, uploadPdfToLeaseRenewals } from '@/lib/storageAdmin'
import { fullySignedPathFromTenant } from '@/lib/leaseRenewalPaths'
import { requireOrgRole } from '@/lib/orgAccess'
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

async function cancelPendingLeaseRenewalReminders(admin: any, renewalId: string) {
  const { data: renewal, error: rErr } = await admin
    .from('lease_renewals')
    .select('lease_id')
    .eq('id', renewalId)
    .single()

  if (rErr) throw new Error(rErr.message)
  const leaseId = (renewal as any)?.lease_id
  if (!leaseId) return

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
    const { user } = await requireUser()
    const renewalId = params.renewalId
    const admin = supabaseAdmin()

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

    await requireOrgRole(user.id, (renewal as any).organization_id, ['admin', 'manager'])

    if ((renewal as any).status !== 'tenant_signed') {
      return NextResponse.json({ error: `Invalid status for manager signing: ${(renewal as any).status}` }, { status: 409 })
    }

    if (!(renewal as any).pdf_tenant_signed_path) {
      return NextResponse.json({ error: 'Missing tenant-signed PDF' }, { status: 400 })
    }

    const pdfBuffer = await downloadPdfFromLeaseRenewals((renewal as any).pdf_tenant_signed_path)

    const managerCert = readP12FromEnv('MANAGER')
    if (!managerCert) {
      return NextResponse.json({ error: 'Missing MANAGER_P12_BASE64 or MANAGER_CERT_PASSWORD' }, { status: 500 })
    }

    const fullySignedPdf = await signPdfIncrementally({
      pdfBuffer,
      p12Buffer: managerCert.p12Buffer,
      passphrase: managerCert.password,
      reason: 'Lease renewal - landlord/manager countersign',
      fieldName: 'ManagerSignature',
      signatureLength: 8192,
    })

    const fullySignedPath = fullySignedPathFromTenant((renewal as any).pdf_tenant_signed_path)
    await uploadPdfToLeaseRenewals(fullySignedPath, fullySignedPdf)

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

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await cancelPendingLeaseRenewalReminders(admin, renewalId)

    await logEvent(admin, {
      renewal_id: renewalId,
      organization_id: (renewal as any).organization_id,
      actor_user_id: user.id,
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

