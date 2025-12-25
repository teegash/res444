import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function requireInternalApiKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) throw new Error("Server misconfigured: INTERNAL_API_KEY missing");

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = auth.slice("Bearer ".length).trim();
  if (token !== expected) throw new Error("Forbidden");
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

async function requireOrgManagerOrAdmin(admin: any, actorUserId: string, organizationId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (error) throw new Error(`Role check failed: ${error.message}`);

  const role = (data?.role as string | undefined) ?? null;
  if (!role) throw new Error("Forbidden: not an organization member");
  if (!["admin", "manager"].includes(role)) throw new Error("Forbidden: insufficient role");
  return role;
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

export async function POST(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req);
    const actorUserId = requireActorUserId(req);

    const renewalId = params.renewalId;
    const admin = supabaseAdmin();

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("id", renewalId)
      .single();

    if (rErr) return json({ error: rErr.message }, 400);

    await requireOrgManagerOrAdmin(admin, actorUserId, renewal.organization_id);

    if (renewal.status === "completed") {
      return json({
        ok: true,
        alreadySigned: true,
        status: renewal.status,
        fullySignedPath: renewal.pdf_fully_signed_path ?? null,
      });
    }

    if (renewal.status !== "in_progress") {
      return json({ error: `Invalid status for manager signing: ${renewal.status}` }, 409);
    }

    if (!renewal.pdf_tenant_signed_path) return json({ error: "Missing pdf_tenant_signed_path" }, 400);

    const p12base64 = process.env.MANAGER_SIGN_P12_BASE64;
    const p12pass = process.env.MANAGER_SIGN_P12_PASSWORD;
    if (!p12base64 || !p12pass) {
      return json({ error: "Missing MANAGER_SIGN_P12_BASE64 or MANAGER_SIGN_P12_PASSWORD" }, 500);
    }

    const pdfBuffer = await downloadPdf(admin, renewal.pdf_tenant_signed_path);
    const p12Buffer = Buffer.from(p12base64, "base64");

    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: "Lease renewal - landlord/manager countersign",
      signatureLength: 8192,
    });

    const signer = new P12Signer(p12Buffer, { passphrase: p12pass });
    const signpdf = new SignPdf();
    const fullySignedPdf = await signpdf.sign(pdfWithPlaceholder, signer);

    const fullySignedPath = fullySignedPathFromTenant(renewal.pdf_tenant_signed_path);
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

    await logEvent(admin, {
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actorUserId,
      action: "manager_signed_and_completed",
      metadata: { fullySignedPath },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return json({ ok: true, fullySignedPath });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status =
      msg === "Unauthorized"
        ? 401
        : msg.startsWith("Missing x-actor-user-id")
          ? 400
          : msg.startsWith("Forbidden")
            ? 403
            : 500;
    return json({ error: msg }, status);
  }
}

