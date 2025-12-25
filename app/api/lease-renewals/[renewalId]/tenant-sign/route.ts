import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/server/supabase/admin";
import { requireInternalApiKey } from "@/src/server/auth/requireInternalApiKey";
import { requireActorUserId } from "@/src/server/auth/requireActor";
import {
  downloadPdf,
  tenantSignedPathFromUnsigned,
  uploadPdf,
} from "@/src/server/lease-renewals/storage";
import { logLeaseRenewalEvent } from "@/src/server/lease-renewals/events";

import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

export const runtime = "nodejs";

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: { renewalId: string } }
) {
  try {
    requireInternalApiKey(req);
    const actorUserId = requireActorUserId(req);

    const admin = supabaseAdmin();
    const renewalId = params.renewalId;

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("id", renewalId)
      .single();

    if (rErr) return err(rErr.message, 400);

    if (renewal.tenant_user_id !== actorUserId) {
      return err("Forbidden: only the tenant can sign this renewal.", 403);
    }

    if (renewal.status === "tenant_signed" || renewal.status === "completed") {
      return NextResponse.json({
        ok: true,
        alreadySigned: true,
        tenantSignedPath: renewal.pdf_tenant_signed_path ?? null,
        status: renewal.status,
      });
    }

    if (renewal.status !== "sent_to_tenant") {
      return err(`Invalid status for tenant signing: ${renewal.status}`, 409);
    }

    if (!renewal.pdf_unsigned_path) return err("Missing unsigned PDF", 400);

    const p12base64 = process.env.TENANT_SIGN_P12_BASE64;
    const p12pass = process.env.TENANT_SIGN_P12_PASSWORD;
    if (!p12base64 || !p12pass) return err("Missing TENANT_SIGN_P12_* env vars", 500);

    const pdfBuffer = await downloadPdf(renewal.pdf_unsigned_path);
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
    await uploadPdf(tenantSignedPath, signedPdf);

    const { error: updErr } = await admin
      .from("lease_renewals")
      .update({
        pdf_tenant_signed_path: tenantSignedPath,
        tenant_signed_at: new Date().toISOString(),
        status: "tenant_signed",
      })
      .eq("id", renewalId);

    if (updErr) return err(updErr.message, 400);

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: actorUserId,
      action: "tenant_signed",
      metadata: { tenantSignedPath },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, tenantSignedPath });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status =
      msg === "Unauthorized"
        ? 401
        : msg.startsWith("Missing x-actor-user-id")
          ? 400
          : msg.startsWith("Forbidden")
            ? 403
            : 500;
    return err(msg, status);
  }
}

