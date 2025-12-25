import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont } from "pdf-lib";
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

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const iso = value.split("T")[0];
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
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

function addMonthsPreserveDayUtc(date: Date, months: number) {
  const startDay = date.getUTCDate();
  const rawMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(rawMonth / 12);
  const monthIndex = ((rawMonth % 12) + 12) % 12;
  const lastDay = lastDayOfMonthUtc(year, monthIndex).getUTCDate();
  const day = Math.min(startDay, lastDay);
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-KE", { style: "currency", currency: "KES" });
}

function safeText(value?: string | null, fallback = "—") {
  const v = (value ?? "").toString().trim();
  return v.length ? v : fallback;
}

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function uploadPdf(admin: any, path: string, bytes: Uint8Array | ArrayBuffer | Buffer) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const { error } = await admin.storage.from("lease-renewals").upload(path, body, {
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

    let leaseId = params.leaseId;
    if (!leaseId || leaseId === "undefined") {
      const parts = new URL(req.url).pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("by-lease");
      if (idx >= 0 && parts[idx + 1]) {
        leaseId = decodeURIComponent(parts[idx + 1]);
      }
    }
    if (!leaseId || leaseId === "undefined") {
      return json({ error: "Missing leaseId" }, 400);
    }
    const admin = supabaseAdmin();

    const { data: lease, error: leaseErr } = await admin
      .from("leases")
      .select(
        "id, organization_id, tenant_user_id, start_date, end_date, unit_id, monthly_rent, deposit_amount, status, next_rent_due_date"
      )
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

    let organization: any = null;
    let tenantProfile: any = null;
    let unit: any = null;
    let building: any = null;

    const { data: orgRow } = await admin
      .from("organizations")
      .select("id, name, email, phone, location, registration_number")
      .eq("id", lease.organization_id)
      .maybeSingle();
    organization = orgRow || null;

    const { data: tenantRow } = await admin
      .from("user_profiles")
      .select("id, full_name, phone_number, address, national_id")
      .eq("id", lease.tenant_user_id)
      .maybeSingle();
    tenantProfile = tenantRow || null;

    if (lease.unit_id) {
      const { data: unitRow } = await admin
        .from("apartment_units")
        .select(
          "id, unit_number, floor, number_of_bedrooms, number_of_bathrooms, size_sqft, building_id"
        )
        .eq("id", lease.unit_id)
        .maybeSingle();
      unit = unitRow || null;
    }

    if (unit?.building_id) {
      const { data: buildingRow } = await admin
        .from("apartment_buildings")
        .select("id, name, location")
        .eq("id", unit.building_id)
        .maybeSingle();
      building = buildingRow || null;
    }

    const leaseStartDate = parseDateOnly(lease.start_date);
    const leaseEndDate = parseDateOnly(lease.end_date);
    const proposedStartDate = parseDateOnly(renewal.proposed_start_date);
    const proposedEndDate = parseDateOnly(renewal.proposed_end_date);

    const termMonthsRaw =
      leaseStartDate && leaseEndDate ? monthsBetweenUtc(leaseStartDate, leaseEndDate) : 0;
    const termMonths = termMonthsRaw > 0 ? termMonthsRaw : 12;

    const renewalStartDate =
      proposedStartDate ?? (leaseEndDate ? addDaysUtc(leaseEndDate, 1) : leaseStartDate);
    let renewalEndDate: Date | null = null;
    if (proposedEndDate) {
      renewalEndDate = proposedEndDate;
    } else if (renewalStartDate) {
      if (termMonths % 12 === 0) {
        renewalEndDate = addMonthsPreserveDayUtc(renewalStartDate, termMonths);
      } else {
        renewalEndDate = lastDayOfMonthUtc(
          renewalStartDate.getUTCFullYear(),
          renewalStartDate.getUTCMonth() + termMonths - 1
        );
      }
    }

    const renewalRent = renewal.proposed_rent ?? lease.monthly_rent;
    const renewalDeposit = renewal.proposed_deposit ?? lease.deposit_amount;
    const renewalNotes = renewal.notes ?? null;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    let page = pdfDoc.addPage(pageSize);
    const margin = 48;
    const lineGap = 12;
    const contentWidth = page.getWidth() - margin * 2;
    const bodySize = 9;
    const headingSize = 11;
    const columnGap = 24;
    const columnWidth = (contentWidth - columnGap) / 2;
    let y = page.getHeight() - margin;

    const addPage = () => {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - margin;
    };

    const ensureSpace = (height: number) => {
      if (y - height < margin + 70) addPage();
    };

    const drawHeading = (text: string) => {
      ensureSpace(headingSize + 10);
      page.drawText(text, { x: margin, y, size: headingSize, font: fontBold, color: rgb(0, 0, 0) });
      y -= headingSize + 10;
    };

    const drawParagraph = (text: string, size = bodySize) => {
      const lines = wrapText(text, contentWidth, font, size);
      ensureSpace(lines.length * lineGap + 6);
      lines.forEach((line) => {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
        y -= lineGap;
      });
      y -= 4;
    };

    const drawLabelValue = (label: string, value: string) => {
      const labelText = `${label}:`;
      const labelWidth = fontBold.widthOfTextAtSize(labelText, bodySize);
      const maxWidth = contentWidth - labelWidth - 6;
      const lines = wrapText(value, maxWidth, font, bodySize);
      ensureSpace(lines.length * lineGap + 4);
      page.drawText(labelText, { x: margin, y, size: bodySize, font: fontBold, color: rgb(0, 0, 0) });
      let lineY = y;
      lines.forEach((line) => {
        page.drawText(line, {
          x: margin + labelWidth + 6,
          y: lineY,
          size: bodySize,
          font,
          color: rgb(0, 0, 0),
        });
        lineY -= lineGap;
      });
      y = lineY - 2;
    };

    const measureBlockHeight = (
      title: string,
      entries: Array<{ label: string; value: string }>,
      width: number
    ) => {
      const titleHeight = headingSize + 4;
      const labelWidth = Math.max(
        ...entries.map((entry) => fontBold.widthOfTextAtSize(`${entry.label}:`, bodySize)),
        0
      );
      let height = titleHeight;
      entries.forEach((entry) => {
        const lines = wrapText(entry.value, width - labelWidth - 6, font, bodySize);
        height += lines.length * lineGap + 2;
      });
      return height;
    };

    const drawBlock = (
      x: number,
      startY: number,
      title: string,
      entries: Array<{ label: string; value: string }>,
      width: number
    ) => {
      const labelWidth = Math.max(
        ...entries.map((entry) => fontBold.widthOfTextAtSize(`${entry.label}:`, bodySize)),
        0
      );
      let cursor = startY;
      page.drawText(title, { x, y: cursor, size: headingSize, font: fontBold, color: rgb(0, 0, 0) });
      cursor -= headingSize + 8;
      entries.forEach((entry) => {
        const labelText = `${entry.label}:`;
        const lines = wrapText(entry.value, width - labelWidth - 6, font, bodySize);
        page.drawText(labelText, { x, y: cursor, size: bodySize, font: fontBold, color: rgb(0, 0, 0) });
        let lineY = cursor;
        lines.forEach((line) => {
          page.drawText(line, { x: x + labelWidth + 6, y: lineY, size: bodySize, font, color: rgb(0, 0, 0) });
          lineY -= lineGap;
        });
        cursor = lineY - 2;
      });
      return startY - cursor;
    };

    const orgName = safeText(organization?.name, "Organization");
    page.drawText(orgName, { x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0) });
    y -= 18;

    const orgLine = [
      organization?.phone ? `Tel: ${organization.phone}` : null,
      organization?.email ? `Email: ${organization.email}` : null,
      organization?.location ? organization.location : null,
      organization?.registration_number ? `Reg: ${organization.registration_number}` : null,
    ]
      .filter(Boolean)
      .join("  |  ");

    if (orgLine) {
      page.drawText(orgLine, { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
    }

    y -= 6;

    const title = "Lease Renewal Agreement";
    const titleSize = 14;
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: margin + (contentWidth - titleWidth) / 2,
      y,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + contentWidth, y },
      thickness: 0.6,
      color: rgb(0.82, 0.82, 0.82),
    });
    y -= 14;

    drawLabelValue("Renewal ID", safeText(renewal.id));
    drawLabelValue("Lease ID", safeText(lease.id));
    drawLabelValue("Generated", new Date().toLocaleString("en-KE"));
    y -= 8;

    const partiesEntries = [
      { label: "Landlord/Manager", value: orgName },
      { label: "Tenant", value: safeText(tenantProfile?.full_name) },
      { label: "Tenant Phone", value: safeText(tenantProfile?.phone_number) },
      { label: "Tenant Address", value: safeText(tenantProfile?.address) },
      { label: "Tenant ID", value: safeText(tenantProfile?.national_id) },
    ].filter((entry) => entry.value !== "—");

    const financialEntries = [
      { label: "Monthly Rent", value: formatMoney(renewalRent) },
      { label: "Deposit", value: formatMoney(renewalDeposit) },
      { label: "Next Rent Due", value: formatDate(lease.next_rent_due_date) },
      { label: "Lease Status", value: safeText(lease.status) },
    ].filter((entry) => entry.value !== "—");

    const propertyEntries = [
      { label: "Property", value: safeText(building?.name) },
      { label: "Location", value: safeText(building?.location) },
      { label: "Unit", value: safeText(unit?.unit_number) },
      { label: "Floor", value: safeText(unit?.floor?.toString()) },
      { label: "Bedrooms", value: safeText(unit?.number_of_bedrooms?.toString()) },
      { label: "Bathrooms", value: safeText(unit?.number_of_bathrooms?.toString()) },
      { label: "Size (sqft)", value: safeText(unit?.size_sqft?.toString()) },
    ].filter((entry) => entry.value !== "—");

    const termLabel = termMonths ? `${termMonths} months` : "—";
    const termEntries = [
      { label: "Current Lease Start", value: formatDate(lease.start_date) },
      { label: "Current Lease End", value: formatDate(lease.end_date) },
      { label: "Renewal Start", value: formatDate(renewalStartDate) },
      { label: "Renewal End", value: formatDate(renewalEndDate) },
      { label: "Renewal Term", value: termLabel },
    ].filter((entry) => entry.value !== "—");

    const partiesHeight = measureBlockHeight("Parties", partiesEntries, columnWidth);
    const financialHeight = measureBlockHeight("Financial Terms", financialEntries, columnWidth);
    ensureSpace(Math.max(partiesHeight, financialHeight) + 6);

    const rowStart = y;
    const usedLeft = drawBlock(margin, rowStart, "Parties", partiesEntries, columnWidth);
    const usedRight = drawBlock(
      margin + columnWidth + columnGap,
      rowStart,
      "Financial Terms",
      financialEntries,
      columnWidth
    );
    y = rowStart - Math.max(usedLeft, usedRight) - 16;

    const propertyHeight = measureBlockHeight("Property & Unit", propertyEntries, columnWidth);
    const termHeight = measureBlockHeight("Lease Term", termEntries, columnWidth);
    ensureSpace(Math.max(propertyHeight, termHeight) + 6);

    const rowStartTwo = y;
    const usedProp = drawBlock(margin, rowStartTwo, "Property & Unit", propertyEntries, columnWidth);
    const usedTerm = drawBlock(
      margin + columnWidth + columnGap,
      rowStartTwo,
      "Lease Term",
      termEntries,
      columnWidth
    );
    y = rowStartTwo - Math.max(usedProp, usedTerm) - 16;

    drawHeading("Notes");
    drawParagraph(
      renewalNotes
        ? renewalNotes
        : "This renewal continues the existing lease terms unless changes are specified in this document."
    );

    drawHeading("Standard Terms");
    drawParagraph(
      "All obligations under the original lease remain in force. Rent is due on or before the agreed due date. "
        + "Late payments may attract penalties as stated in the original lease. The tenant agrees to maintain the premises "
        + "in good condition and report any issues promptly. Termination and notice requirements remain unchanged unless "
        + "otherwise stated."
    );

    const pages = pdfDoc.getPages();
    pages.forEach((p, idx) => {
      const footerY = 28;
      p.drawText(
        "This document is generated electronically and remains valid without a physical seal.",
        { x: margin, y: footerY, size: 8, font, color: rgb(0.4, 0.4, 0.4) }
      );
      p.drawText(`Page ${idx + 1} of ${pages.length}`, {
        x: p.getWidth() - margin,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
        align: "right",
      });
    });

    const unsignedBytes = await pdfDoc.save({ useObjectStreams: false });

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
