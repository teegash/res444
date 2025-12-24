import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSupabaseUserFromCookies } from '@/lib/supabaseCookieAuth'
import { requireOrgRole } from '@/lib/requireOrgRole'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'
import { downloadPdf, uploadPdf } from '@/lib/leaseRenewalStorage'
import { signPdfIncrementally } from '@/lib/leaseRenewalSigning'
import { fullySignedPathFromTenant } from '@/lib/leaseRenewalPaths'

export const runtime = 'nodejs'

async function cancelPendingLeaseRenewalReminders(admin: any, leaseId: string) {
  const { error } = await admin
    .from('reminders')
    .update({
      delivery_status: 'failed',
      last_error: 'Cancelled: renewal completed',
    })
    .eq('reminder_type', 'lease_renewal')
    .eq('related_entity_type', 'lease')
    .eq('related_entity_id', leaseId)
    .in('delivery_status', ['pending', 'processing'])

  if (error) throw new Error(error.message)
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const actor = await requireSupabaseUserFromCookies()
    const admin = supabaseAdmin()
    const renewalId = params.renewalId

    const { data: renewal, error: rErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('id', renewalId)
      .single()

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

    await requireOrgRole(actor.id, renewal.organization_id, ['admin', 'manager'])

    if (renewal.status !== 'tenant_signed') {
      return NextResponse.json({ error: `Invalid status for manager signing: ${renewal.status}` }, { status: 409 })
    }
    if (!renewal.pdf_tenant_signed_path) {
      return NextResponse.json({ error: 'Missing tenant-signed PDF' }, { status: 400 })
    }

    const pdfBuffer = await downloadPdf(renewal.pdf_tenant_signed_path)
    const fullySignedPdf = await signPdfIncrementally({
      pdfBuffer,
      kind: 'manager',
      reason: 'Lease renewal - landlord/manager countersign',
    })

    const fullySignedPath = fullySignedPathFromTenant(renewal.pdf_tenant_signed_path)
    await uploadPdf(fullySignedPath, fullySignedPdf)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_fully_signed_path: fullySignedPath,
        manager_signed_at: new Date().toISOString(),
        status: 'completed',
      })
      .eq('id', renewalId)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await cancelPendingLeaseRenewalReminders(admin, renewal.lease_id)

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actor.id,
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

