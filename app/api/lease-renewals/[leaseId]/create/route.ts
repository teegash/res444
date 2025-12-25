import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";
import { requireInternalApiKey } from "@/src/lib/internalApiAuth";
import { unsignedPath, uploadPdf } from "@/src/lib/leaseRenewalStorage";
import { logLeaseRenewalEvent } from "@/src/lib/leaseRenewalEvents";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { leaseId: string } }
) {
  try {
    requireInternalApiKey(req);

    const leaseId = params.leaseId;
    const admin = supabaseAdmin();

    const { data: lease, error: leaseErr } = await admin
      .from("leases")
      .select(
        "id, organization_id, tenant_user_id, start_date, end_date, unit_id, building_id"
      )
      .eq("id", leaseId)
      .single();

    if (leaseErr)
      return NextResponse.json({ error: leaseErr.message }, { status: 400 });

    const { data: renewal, error: renewErr } = await admin
      .from("lease_renewals")
      .insert({
        organization_id: lease.organization_id,
        lease_id: lease.id,
        tenant_user_id: lease.tenant_user_id,
        status: "draft",
      })
      .select("*")
      .single();

    if (renewErr)
      return NextResponse.json({ error: renewErr.message }, { status: 400 });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const draw = (text: string, x: number, y: number, size = 10) =>
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });

    draw("LEASE RENEWAL AGREEMENT (KENYA)", 50, 800, 14);
    draw(`Renewal ID: ${renewal.id}`, 50, 780);
    draw(`Lease ID: ${lease.id}`, 50, 765);
    draw(`Lease Start: ${lease.start_date ?? "-"}`, 50, 750);
    draw(`Lease End (Current): ${lease.end_date ?? "-"}`, 50, 735);

    draw("Tenant Digital Signature:", 50, 140, 11);
    page.drawLine({
      start: { x: 50, y: 120 },
      end: { x: 250, y: 120 },
      thickness: 1,
    });

    draw("Landlord/Manager Digital Signature:", 320, 140, 11);
    page.drawLine({
      start: { x: 320, y: 120 },
      end: { x: 540, y: 120 },
      thickness: 1,
    });

    const unsignedBytes = await pdfDoc.save();

    const path = unsignedPath(lease.organization_id, lease.id, renewal.id);
    await uploadPdf(path, unsignedBytes);

    const { error: updErr } = await admin
      .from("lease_renewals")
      .update({ pdf_unsigned_path: path, status: "sent_to_tenant" })
      .eq("id", renewal.id);

    if (updErr)
      return NextResponse.json({ error: updErr.message }, { status: 400 });

    await logLeaseRenewalEvent({
      renewal_id: renewal.id,
      organization_id: lease.organization_id,
      actor_user_id: null,
      action: "created_and_sent_to_tenant",
      metadata: { unsignedPath: path },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, renewalId: renewal.id, unsignedPath: path });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

