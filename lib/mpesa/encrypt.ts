import crypto from 'crypto'

/**
 * Generate timestamp in format YYYYMMDDHHmmss
 */
export function generateTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

/**
 * Generate password for Daraja API
 * Password = Base64(BusinessShortCode + PassKey + Timestamp)
 */
export function generatePassword(
  businessShortCode: string,
  passKey: string,
  timestamp: string
): string {
  const passwordString = `${businessShortCode}${passKey}${timestamp}`
  return Buffer.from(passwordString).toString('base64')
}

/**
 * Encrypt security credential for Daraja API (if needed)
 * This is for production use with encrypted credentials
 */
export function encryptSecurityCredential(
  plainText: string,
  publicKey: string
): string {
  try {
    const buffer = Buffer.from(plainText, 'utf8')
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    )
    return encrypted.toString('base64')
  } catch (error) {
    console.error('Error encrypting security credential:', error)
    throw new Error('Failed to encrypt security credential')
  }
}

