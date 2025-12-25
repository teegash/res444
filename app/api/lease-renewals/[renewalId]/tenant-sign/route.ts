import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseAdmin";
import { requireInternalApiKey } from "@/src/lib/internalApiAuth";
import {
  downloadPdf,
  tenantSignedPathFromUnsigned,
  uploadPdf,
} from "@/src/lib/leaseRenewalStorage";
import { logLeaseRenewalEvent } from "@/src/lib/leaseRenewalEvents";

import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

export const runtime = "nodejs";

function getTenantSigningCert() {
  const p12base64 = process.env.TENANT_P12_BASE64 || process.env.TENANT_SIGN_P12_BASE64;
  const pass =
    process.env.TENANT_CERT_PASSWORD || process.env.TENANT_SIGN_P12_PASSWORD;

  if (!p12base64 || !pass) return null;
  return { p12base64, pass };
}

export async function POST(
  req: Request,
  { params }: { params: { renewalId: string } }
) {
  try {
    requireInternalApiKey(req);

    const renewalId = params.renewalId;
    const admin = supabaseAdmin();

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("id", renewalId)
      .single();

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });

    if (renewal.status !== "sent_to_tenant") {
      return NextResponse.json(
        { error: `Invalid status for tenant signing: ${renewal.status}` },
        { status: 409 }
      );
    }
    if (!renewal.pdf_unsigned_path) {
      return NextResponse.json({ error: "Missing unsigned PDF" }, { status: 400 });
    }

    const pdfBuffer = await downloadPdf(renewal.pdf_unsigned_path);

    const cert = getTenantSigningCert();
    if (!cert) {
      return NextResponse.json(
        {
          error:
            "Missing tenant signing cert env vars (TENANT_P12_BASE64 + TENANT_CERT_PASSWORD)",
        },
        { status: 500 }
      );
    }

    const p12Buffer = Buffer.from(cert.p12base64, "base64");

    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: "Lease renewal - tenant signing",
      signatureLength: 8192,
    });

    const signer = new P12Signer(p12Buffer, { passphrase: cert.pass });
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

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    await logLeaseRenewalEvent({
      renewal_id: renewalId,
      organization_id: renewal.organization_id,
      actor_user_id: null,
      action: "tenant_signed",
      metadata: { tenantSignedPath },
      ip: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, tenantSignedPath });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

