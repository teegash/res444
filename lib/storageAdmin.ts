import { createAdminClient } from '@/lib/supabase/admin'

export function supabaseAdmin() {
  const admin = createAdminClient()
  if (!admin) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return admin
}

export async function uploadPdfToLeaseRenewals(path: string, pdfBytes: Uint8Array | ArrayBuffer | Buffer) {
  const supabase = supabaseAdmin()
  const { error } = await supabase.storage
    .from('lease-renewals')
    .upload(path, pdfBytes as any, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(error.message)
}

export async function downloadPdfFromLeaseRenewals(path: string): Promise<Buffer> {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.storage.from('lease-renewals').download(path)
  if (error) throw new Error(error.message)
  return Buffer.from(await data.arrayBuffer())
}

export async function createSignedUrlLeaseRenewals(path: string, expiresInSeconds = 60) {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.storage.from('lease-renewals').createSignedUrl(path, expiresInSeconds)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

