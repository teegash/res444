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

function tenantSignedPathFromUnsigned(unsignedPath: string) {
  return unsignedPath.replace("/unsigned.pdf", "/tenant_signed.pdf");
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

    if (renewal.tenant_user_id !== actorUserId) {
      return json({ error: "Forbidden: only the tenant can sign this renewal." }, 403);
    }

    if (renewal.status === "in_progress" || renewal.status === "completed") {
      return json({
        ok: true,
        alreadySigned: true,
        status: renewal.status,
        tenantSignedPath: renewal.pdf_tenant_signed_path ?? null,
      });
    }

    if (renewal.status !== "sent_for_signature") {
      return json({ error: `Invalid status for tenant signing: ${renewal.status}` }, 409);
    }

    if (!renewal.pdf_unsigned_path) return json({ error: "Missing pdf_unsigned_path" }, 400);

    const p12base64 = process.env.TENANT_SIGN_P12_BASE64;
    const p12pass = process.env.TENANT_SIGN_P12_PASSWORD;
    if (!p12base64 || !p12pass) {
      return json({ error: "Missing TENANT_SIGN_P12_BASE64 or TENANT_SIGN_P12_PASSWORD" }, 500);
    }

    const pdfBuffer = await downloadPdf(admin, renewal.pdf_unsigned_path);
    const p12Buffer = Buffer.from(p12base64, "base64");

    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: "Lease renewal - tenant signing",
      signatureLength: 8192,
    });

    const signer = new P12Signer(p12Buffer, { passphrase: p12pass });
    const signpdf = new SignPdf();
    const signedPdf = await signpdf.sign(pdfWithPlaceholder, signer);

    const tenantSignedPath = tenantSignedPathFromUnsigned(renewal.pdf_unsigned_path);
    await uploadPdf(admin, tenantSignedPath, signedPdf);

    const { error: updErr } = await admin
      .from("lease_renewals")
      .update({
        pdf_tenant_signed_path: tenantSignedPath,
        tenant_signed_at: new Date().toISOString(),
        status: "in_progress",
      })
      .eq("id", renewalId);

    if (updErr) return json({ error: updErr.message }, 400);

    await logEvent(admin, {
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actorUserId,
      action: "tenant_signed",
      metadata: { tenantSignedPath },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return json({ ok: true, tenantSignedPath });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
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

