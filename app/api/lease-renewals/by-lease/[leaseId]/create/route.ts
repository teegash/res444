import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function requireInternalApiKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) throw new Error("Server misconfigured: INTERNAL_API_KEY missing");

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token !== expected) throw new Error("Forbidden");
    return;
  }

  const direct = req.headers.get("x-internal-api-key");
  if (direct) {
    if (direct !== expected) throw new Error("Forbidden");
    return;
  }

  throw new Error("Unauthorized");
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function unsignedPath(orgId: string, leaseId: string, renewalId: string) {
  return `org/${orgId}/lease/${leaseId}/renewal/${renewalId}/unsigned.pdf`;
}

async function uploadPdf(admin: any, path: string, bytes: Uint8Array | ArrayBuffer) {
  const { error } = await admin.storage.from("lease-renewals").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

async function logEvent(
  admin: any,
  args: {
    renewal_id: string;
    organization_id: string;
    actor_user_id?: string | null;
    action: string;
    metadata?: any;
    ip?: string | null;
    user_agent?: string | null;
  }
) {
  const { error } = await admin.from("lease_renewal_events").insert({
    renewal_id: args.renewal_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id ?? null,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.user_agent ?? null,
  });
  if (error) throw new Error(`Failed to log event: ${error.message}`);
}

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    requireInternalApiKey(req);

    const leaseId = params.leaseId;
    const admin = supabaseAdmin();

    const { data: lease, error: leaseErr } = await admin
      .from("leases")
      .select("id, organization_id, tenant_user_id, start_date, end_date, unit_id, building_id")
      .eq("id", leaseId)
      .single();

    if (leaseErr) return json({ error: leaseErr.message }, 400);
    if (!lease?.tenant_user_id) return json({ error: "Lease has no tenant_user_id" }, 400);

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

    if (renewErr) return json({ error: renewErr.message }, 400);

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
    page.drawLine({ start: { x: 50, y: 120 }, end: { x: 250, y: 120 }, thickness: 1 });

    draw("Landlord/Manager Digital Signature:", 320, 140, 11);
    page.drawLine({ start: { x: 320, y: 120 }, end: { x: 540, y: 120 }, thickness: 1 });

    const unsignedBytes = await pdfDoc.save();

    const path = unsignedPath(lease.organization_id, lease.id, renewal.id);
    await uploadPdf(admin, path, unsignedBytes);

    const { error: updErr } = await admin
      .from("lease_renewals")
      .update({
        pdf_unsigned_path: path,
        status: "sent_for_signature",
      })
      .eq("id", renewal.id);

    if (updErr) return json({ error: updErr.message }, 400);

    await logEvent(admin, {
      renewal_id: renewal.id,
      organization_id: lease.organization_id,
      actor_user_id: null,
      action: "created_and_sent_for_signature",
      metadata: { unsignedPath: path },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return json({ ok: true, renewalId: renewal.id, unsignedPath: path });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return json({ error: msg }, status);
  }
}
