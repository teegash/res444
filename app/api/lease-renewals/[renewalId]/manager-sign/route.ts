import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

export const runtime = "nodejs";

type RenewalRow = {
  id: string;
  organization_id: string;
  lease_id: string;
  status: string;
  pdf_tenant_signed_path: string | null;
  pdf_fully_signed_path: string | null;
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
  proposed_rent?: number | null;
  proposed_deposit?: number | null;
};

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

function requireActorUserId(req: Request) {
  const actor = req.headers.get("x-actor-user-id");
  if (!actor) throw new Error("Missing x-actor-user-id");
  return actor;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const iso = value.split("T")[0];
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthsBetweenUtc(start: Date, end: Date) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
}

function lastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

async function getMembership(admin: any, organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Organization membership check failed: ${error.message}`);
  return data;
}

async function downloadPdf(admin: any, path: string) {
  const { data, error } = await admin.storage.from("lease-renewals").download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function uploadPdf(admin: any, path: string, bytes: Uint8Array | Buffer) {
  const { error } = await admin.storage.from("lease-renewals").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

function fullySignedPathFromTenant(tenantSignedPath: string) {
  return tenantSignedPath.replace("/tenant_signed.pdf", "/fully_signed.pdf");
}

async function addFullySignedStamp(pdfBuffer: Buffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const stampText = "FULLY SIGNED";
  const dateText = `Countersigned: ${new Date().toLocaleDateString("en-KE")}`;
  const size = 11;
  const padding = 6;
  const textWidth = font.widthOfTextAtSize(stampText, size);
  const boxWidth = textWidth + padding * 2;
  const boxHeight = size + padding * 2;
  const x = page.getWidth() - boxWidth - 48;
  const y = page.getHeight() - boxHeight - 120;

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    borderWidth: 1,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.12, 0.45, 0.2),
  });
  page.drawText(stampText, {
    x: x + padding,
    y: y + padding,
    size,
    font,
    color: rgb(0.12, 0.45, 0.2),
  });
  page.drawText(dateText, {
    x: x,
    y: y - 12,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const stampedBytes = await pdfDoc.save();
  return Buffer.from(stampedBytes);
}

async function logEvent(
  admin: any,
  args: {
    renewal_id: string;
    organization_id: string;
    actor_user_id: string | null;
    action: string;
    metadata?: any;
    ip?: string | null;
    user_agent?: string | null;
  }
) {
  const { error } = await admin.from("lease_renewal_events").insert({
    renewal_id: args.renewal_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.user_agent ?? null,
  });
  if (error) throw new Error(`Failed to log event: ${error.message}`);
}

async function cancelPendingLeaseRenewalReminders(admin: any, leaseId: string) {
  const { error } = await admin
    .from("reminders")
    .update({
      delivery_status: "failed",
      last_error: "Cancelled: renewal completed",
    })
    .eq("reminder_type", "lease_renewal")
    .eq("related_entity_type", "lease")
    .eq("related_entity_id", leaseId)
    .eq("delivery_status", "pending");

  if (error) throw new Error(`Failed to cancel reminders: ${error.message}`);
}

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req);
    const actorUserId = requireActorUserId(req);

    const renewalId = params.renewalId;
    if (!renewalId || renewalId === "undefined") {
      return json({ error: "Missing renewalId" }, 400);
    }
    const admin = supabaseAdmin();

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select(
        "id, organization_id, lease_id, status, pdf_tenant_signed_path, pdf_fully_signed_path, proposed_start_date, proposed_end_date, proposed_rent, proposed_deposit"
      )
      .eq("id", renewalId)
      .single();

    if (rErr) return json({ error: rErr.message }, 400);

    const r = renewal as RenewalRow;

    const membership = await getMembership(admin, r.organization_id, actorUserId);
    const role = String(membership?.role ?? "").toLowerCase();
    if (!["admin", "manager", "caretaker"].includes(role)) {
      return json({ error: `Forbidden: role '${role}' cannot countersign` }, 403);
    }

    if (r.status === "completed") {
      return json({ ok: true, alreadyCompleted: true, fullySignedPath: r.pdf_fully_signed_path });
    }

    if (r.status !== "in_progress") {
      return json({ error: `Invalid status for manager signing: ${r.status}` }, 409);
    }

    if (!r.pdf_tenant_signed_path) return json({ error: "Missing pdf_tenant_signed_path" }, 400);

    const { data: leaseRow, error: leaseErr } = await admin
      .from("leases")
      .select("id, start_date, end_date, monthly_rent, deposit_amount, status")
      .eq("id", r.lease_id)
      .single();

    if (leaseErr) return json({ error: leaseErr.message }, 400);

    const leaseStartDate = parseDateOnly(leaseRow?.start_date);
    const leaseEndDate = parseDateOnly(leaseRow?.end_date);
    const proposedStartDate = parseDateOnly(r.proposed_start_date ?? null);
    const proposedEndDate = parseDateOnly(r.proposed_end_date ?? null);

    const termMonthsRaw =
      leaseStartDate && leaseEndDate ? monthsBetweenUtc(leaseStartDate, leaseEndDate) : 0;
    const termMonths = termMonthsRaw > 0 ? termMonthsRaw : 12;

    const renewalStartDate =
      proposedStartDate ?? (leaseEndDate ? addDaysUtc(leaseEndDate, 1) : leaseStartDate);
    const renewalEndDate = proposedEndDate
      ? proposedEndDate
      : renewalStartDate
        ? lastDayOfMonthUtc(
            renewalStartDate.getUTCFullYear(),
            renewalStartDate.getUTCMonth() + termMonths - 1
          )
        : null;

    const renewalRent =
      r.proposed_rent !== null && r.proposed_rent !== undefined ? r.proposed_rent : leaseRow?.monthly_rent;
    const renewalDeposit =
      r.proposed_deposit !== null && r.proposed_deposit !== undefined
        ? r.proposed_deposit
        : leaseRow?.deposit_amount;

    const p12base64 = process.env.MANAGER_P12_BASE64;
    const p12pass = process.env.MANAGER_CERT_PASSWORD;
    if (!p12base64 || !p12pass) {
      return json({ error: "Missing MANAGER_P12_BASE64 or MANAGER_CERT_PASSWORD" }, 500);
    }

    const pdfBuffer = await downloadPdf(admin, r.pdf_tenant_signed_path);
    const p12Buffer = Buffer.from(p12base64, "base64");

    const stampedPdf = await addFullySignedStamp(pdfBuffer);

    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: stampedPdf,
      reason: "Lease renewal - landlord/manager countersign",
      signatureLength: 8192,
    });

    const signer = new P12Signer(p12Buffer, { passphrase: p12pass });
    const signpdf = new SignPdf();
    const fullySignedPdf = await signpdf.sign(pdfWithPlaceholder, signer);

    const fullySignedPath = fullySignedPathFromTenant(r.pdf_tenant_signed_path);
    await uploadPdf(admin, fullySignedPath, fullySignedPdf);

    const { error: updErr } = await admin
      .from("lease_renewals")
      .update({
        pdf_fully_signed_path: fullySignedPath,
        manager_signed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", renewalId);

    if (updErr) return json({ error: updErr.message }, 400);

    const leaseUpdates: Record<string, any> = {};
    if (renewalStartDate) leaseUpdates.start_date = toIsoDate(renewalStartDate);
    if (renewalEndDate) leaseUpdates.end_date = toIsoDate(renewalEndDate);
    if (renewalRent !== null && renewalRent !== undefined) leaseUpdates.monthly_rent = renewalRent;
    if (renewalDeposit !== null && renewalDeposit !== undefined) leaseUpdates.deposit_amount = renewalDeposit;

    if (Object.keys(leaseUpdates).length > 0) {
      const { error: leaseUpdErr } = await admin.from("leases").update(leaseUpdates).eq("id", r.lease_id);
      if (leaseUpdErr) return json({ error: leaseUpdErr.message }, 400);
    }

    await cancelPendingLeaseRenewalReminders(admin, r.lease_id);

    await logEvent(admin, {
      renewal_id: renewalId,
      organization_id: r.organization_id,
      actor_user_id: actorUserId,
      action: "manager_signed_and_completed",
      metadata: { fullySignedPath },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return json({ ok: true, fullySignedPath });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Forbidden"
          ? 403
          : msg.startsWith("Missing x-actor-user-id")
            ? 400
            : 500;
    return json({ error: msg }, status);
  }
}
