import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireSupabaseUserFromCookies } from '@/lib/supabaseCookieAuth'
import { requireOrgRole } from '@/lib/requireOrgRole'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'
import { uploadPdf } from '@/lib/leaseRenewalStorage'
import { unsignedRenewalPath } from '@/lib/leaseRenewalPaths'

export const runtime = 'nodejs'

const ACTIVE_RENEWAL_STATUSES = ['draft', 'sent_to_tenant', 'tenant_signed', 'manager_signed'] as const

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    const actor = await requireSupabaseUserFromCookies()
    const leaseId = params.leaseId

    const admin = supabaseAdmin()

    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, organization_id, tenant_user_id, start_date, end_date')
      .eq('id', leaseId)
      .single()

    if (leaseErr) return NextResponse.json({ error: leaseErr.message }, { status: 400 })

    await requireOrgRole(actor.id, lease.organization_id, ['admin', 'manager'])

    const { data: existing, error: existingErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('lease_id', lease.id)
      .in('status', [...ACTIVE_RENEWAL_STATUSES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 })

    if (existing?.id && existing?.pdf_unsigned_path) {
      return NextResponse.json({ ok: true, renewalId: existing.id, unsignedPath: existing.pdf_unsigned_path })
    }

    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .insert({
        organization_id: lease.organization_id,
        lease_id: lease.id,
        tenant_user_id: lease.tenant_user_id,
        status: 'draft',
      })
      .select('*')
      .single()

    if (renewErr) return NextResponse.json({ error: renewErr.message }, { status: 400 })

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const draw = (text: string, x: number, y: number, size = 10) =>
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) })

    draw('LEASE RENEWAL AGREEMENT (KENYA)', 50, 800, 14)
    draw(`Renewal ID: ${renewal.id}`, 50, 780)
    draw(`Lease ID: ${lease.id}`, 50, 765)
    draw(`Lease Start: ${lease.start_date ?? '-'}`, 50, 750)
    draw(`Lease End (Current): ${lease.end_date ?? '-'}`, 50, 735)

    draw('Tenant Digital Signature:', 50, 140, 11)
    page.drawLine({ start: { x: 50, y: 120 }, end: { x: 250, y: 120 }, thickness: 1 })

    draw('Landlord/Manager Digital Signature:', 320, 140, 11)
    page.drawLine({ start: { x: 320, y: 120 }, end: { x: 540, y: 120 }, thickness: 1 })

    const unsignedBytes = await pdfDoc.save()
    const path = unsignedRenewalPath(lease.organization_id, lease.id, renewal.id)
    await uploadPdf(path, unsignedBytes)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({ pdf_unsigned_path: path, status: 'sent_to_tenant' })
      .eq('id', renewal.id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await logLeaseRenewalEvent({
      renewal_id: renewal.id,
      organization_id: lease.organization_id,
      actor_user_id: actor.id,
      action: 'created_and_sent_to_tenant',
      metadata: { unsignedPath: path },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, renewalId: renewal.id, unsignedPath: path })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

