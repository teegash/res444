import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'

type SignerKind = 'TENANT' | 'MANAGER'

export function readP12FromEnv(kind: SignerKind) {
  const p12b64 = process.env[`${kind}_P12_BASE64`]
  const pass = process.env[`${kind}_CERT_PASSWORD`]
  if (!p12b64 || !pass) {
    throw new Error(`Missing ${kind}_P12_BASE64 or ${kind}_CERT_PASSWORD env vars`)
  }
  return { p12Buffer: Buffer.from(p12b64, 'base64'), passphrase: pass }
}

export async function signPdfIncrementally(args: {
  pdfBuffer: Buffer
  kind: SignerKind
  reason: string
  signatureLength?: number
}) {
  const { p12Buffer, passphrase } = readP12FromEnv(args.kind)

  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer: args.pdfBuffer,
    reason: args.reason,
    signatureLength: args.signatureLength ?? 8192,
  })

  const signer = new P12Signer(p12Buffer, { passphrase })
  const signpdf = new SignPdf()
  const signed = await signpdf.sign(pdfWithPlaceholder, signer)
  return Buffer.isBuffer(signed) ? signed : Buffer.from(signed)
}

