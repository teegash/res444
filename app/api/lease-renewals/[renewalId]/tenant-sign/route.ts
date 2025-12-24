import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSupabaseUserFromCookies } from '@/lib/supabaseCookieAuth'
import { requireOrgRole } from '@/lib/requireOrgRole'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'
import { downloadPdf, uploadPdf } from '@/lib/leaseRenewalStorage'
import { signPdfIncrementally } from '@/lib/leaseRenewalSigning'
import { tenantSignedPathFromUnsigned } from '@/lib/leaseRenewalPaths'

export const runtime = 'nodejs'

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

    if (actor.id !== renewal.tenant_user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await requireOrgRole(actor.id, renewal.organization_id, ['tenant'])

    if (renewal.status !== 'sent_to_tenant') {
      return NextResponse.json({ error: `Invalid status for tenant signing: ${renewal.status}` }, { status: 409 })
    }
    if (!renewal.pdf_unsigned_path) return NextResponse.json({ error: 'Missing unsigned PDF' }, { status: 400 })

    const pdfBuffer = await downloadPdf(renewal.pdf_unsigned_path)
    const signedPdf = await signPdfIncrementally({
      pdfBuffer,
      kind: 'tenant',
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

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actor.id,
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

