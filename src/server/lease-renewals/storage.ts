import "server-only";
import { supabaseAdmin } from "@/src/server/supabase/admin";

const BUCKET = "lease-renewals";

export function tenantSignedPathFromUnsigned(unsignedPath: string) {
  return unsignedPath.replace("/unsigned.pdf", "/tenant_signed.pdf");
}

export function fullySignedPathFromTenant(tenantSignedPath: string) {
  return tenantSignedPath.replace("/tenant_signed.pdf", "/fully_signed.pdf");
}

export async function downloadPdf(path: string): Promise<Buffer> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadPdf(path: string, bytes: Uint8Array | ArrayBuffer | Buffer) {
  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes as any, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

