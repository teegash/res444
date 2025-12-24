import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireInternalApiKey } from '@/lib/internalApiAuth'
import { requireActorUserId, requireOrgRole } from '@/lib/actorRole'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { unsignedPath, uploadPdf } from '@/lib/leaseRenewalStorage'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalEvents'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    requireInternalApiKey(req)
    const actorUserId = requireActorUserId(req)

    const leaseId = params.leaseId
    const admin = supabaseAdmin()

    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, organization_id, tenant_user_id, start_date, end_date, unit_id, building_id')
      .eq('id', leaseId)
      .single()

    if (leaseErr) return NextResponse.json({ success: false, error: leaseErr.message }, { status: 400 })

    await requireOrgRole({
      actorUserId,
      organizationId: lease.organization_id,
      allowedRoles: ['admin', 'manager'],
    })

    const { data: existing, error: existingErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('lease_id', lease.id)
      .in('status', ['draft', 'sent_to_tenant', 'tenant_signed', 'manager_signed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingErr) return NextResponse.json({ success: false, error: existingErr.message }, { status: 400 })

    const renewal = existing
      ? existing
      : (
          await admin
            .from('lease_renewals')
            .insert({
              organization_id: lease.organization_id,
              lease_id: lease.id,
              tenant_user_id: lease.tenant_user_id,
              status: 'draft',
            })
            .select('*')
            .single()
        ).data

    if (!renewal) {
      return NextResponse.json({ success: false, error: 'Failed to create renewal envelope.' }, { status: 500 })
    }

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
    const path = unsignedPath(lease.organization_id, lease.id, renewal.id)
    if (!renewal.pdf_unsigned_path) {
      await uploadPdf(path, unsignedBytes)
    }

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_unsigned_path: renewal.pdf_unsigned_path || path,
        status: renewal.status === 'draft' ? 'sent_to_tenant' : renewal.status,
      })
      .eq('id', renewal.id)

    if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 400 })

    if (!existing) {
      await logLeaseRenewalEvent({
        renewal_id: renewal.id,
        organization_id: lease.organization_id,
        actor_user_id: actorUserId,
        action: 'created_and_sent_to_tenant',
        metadata: { unsignedPath: renewal.pdf_unsigned_path || path },
        ip: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
      })
    }

    return NextResponse.json({
      success: true,
      data: { renewalId: renewal.id, unsignedPath: renewal.pdf_unsigned_path || path },
    })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden' || String(msg).startsWith('Forbidden')
          ? 403
          : String(msg).startsWith('Missing')
            ? 400
            : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
