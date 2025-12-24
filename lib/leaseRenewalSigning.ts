import { SignPdf } from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'

type SignerKind = 'tenant' | 'manager'

function readSignerFromEnv(kind: SignerKind) {
  if (kind === 'tenant') {
    const p12base64 = process.env.TENANT_P12_BASE64
    const passphrase = process.env.TENANT_CERT_PASSWORD
    if (!p12base64 || !passphrase) {
      throw new Error('Missing TENANT_P12_BASE64 or TENANT_CERT_PASSWORD env vars')
    }
    return { p12Buffer: Buffer.from(p12base64, 'base64'), passphrase }
  }

  const p12base64 = process.env.MANAGER_P12_BASE64
  const passphrase = process.env.MANAGER_CERT_PASSWORD
  if (!p12base64 || !passphrase) {
    throw new Error('Missing MANAGER_P12_BASE64 or MANAGER_CERT_PASSWORD env vars')
  }
  return { p12Buffer: Buffer.from(p12base64, 'base64'), passphrase }
}

export async function signPdfIncrementally(args: {
  pdfBuffer: Buffer
  kind: SignerKind
  reason: string
  signatureLength?: number
}) {
  const { p12Buffer, passphrase } = readSignerFromEnv(args.kind)

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

