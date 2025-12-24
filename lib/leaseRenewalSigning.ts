import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'

function normalizeBase64(value: string) {
  return value.replace(/\s+/g, '')
}

export function readP12FromEnv(prefix: 'TENANT' | 'MANAGER') {
  const base64 = process.env[`${prefix}_P12_BASE64`] || ''
  const password = process.env[`${prefix}_CERT_PASSWORD`] || ''
  if (!base64 || !password) return null
  return { p12Buffer: Buffer.from(normalizeBase64(base64), 'base64'), password }
}

export async function signPdfIncrementally(args: {
  pdfBuffer: Buffer
  p12Buffer: Buffer
  passphrase: string
  reason: string
  fieldName: string
  signatureLength?: number
}) {
  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer: args.pdfBuffer,
    reason: args.reason,
    signatureLength: args.signatureLength ?? 8192,
    fieldName: args.fieldName,
  })

  const signer = new P12Signer(args.p12Buffer, { passphrase: args.passphrase })
  const signpdf = new SignPdf()
  const signed = await Promise.resolve(signpdf.sign(pdfWithPlaceholder, signer))
  return Buffer.from(signed)
}

