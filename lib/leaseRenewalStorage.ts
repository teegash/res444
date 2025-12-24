import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const BUCKET = 'lease-renewals'

export function unsignedPath(orgId: string, leaseId: string, renewalId: string) {
  return `org/${orgId}/lease/${leaseId}/renewal/${renewalId}/unsigned.pdf`
}

export function tenantSignedPathFromUnsigned(unsigned: string) {
  return unsigned.replace('/unsigned.pdf', '/tenant_signed.pdf')
}

export function fullySignedPathFromTenant(tenantSigned: string) {
  return tenantSigned.replace('/tenant_signed.pdf', '/fully_signed.pdf')
}

export async function uploadPdf(path: string, bytes: Uint8Array | ArrayBuffer | Buffer) {
  const admin = supabaseAdmin()
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes as any, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw new Error(error.message)
}

export async function downloadPdf(path: string): Promise<Buffer> {
  const admin = supabaseAdmin()
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error) throw new Error(error.message)
  return Buffer.from(await data.arrayBuffer())
}

export async function createSignedUrl(path: string, expiresInSeconds = 60) {
  const admin = supabaseAdmin()
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

