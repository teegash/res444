import AfricasTalking from 'africastalking'

let smsChannel: ReturnType<typeof AfricasTalking>['SMS'] | null = null
let cachedSignature: string | null = null

export interface AfricasTalkingConfig {
  apiKey: string
  username: string
  senderId?: string
  environment: 'sandbox' | 'production'
}

export interface SendSMSRequest {
  message: string
  recipients: string | string[]
  senderId?: string
}

export interface SendSMSResponse {
  success: boolean
  messageId?: string
  recipients?: Array<{
    statusCode: number
    number: string
    status: string
    cost: string
    messageId: string
  }>
  errorCode?: string
  errorMessage?: string
}

export interface DeliveryStatusCallback {
  id: string
  status: string
  phoneNumber: string
  networkCode?: string
  failureReason?: string
  retryCount?: string
}

/**
 * Get Africa's Talking API base URL
 */
function ensureSmsChannel(config: AfricasTalkingConfig) {
  const signature = `${config.username}:${config.apiKey}`
  if (!smsChannel || cachedSignature !== signature) {
    const client = AfricasTalking({
      apiKey: config.apiKey,
      username: config.username,
    })
    smsChannel = client.SMS
    cachedSignature = signature
  }
  return smsChannel
}

/**
 * Format phone number for Africa's Talking
 * Ensures format: +254XXXXXXXXX
 */
export function formatPhoneNumber(phone: string): string {
  let formatted = phone.replace(/\s/g, '').trim()

  // Remove leading + if present
  if (formatted.startsWith('+')) {
    formatted = formatted.substring(1)
  }

  // Handle Kenya numbers
  if (formatted.startsWith('254')) {
    return `+${formatted}`
  } else if (formatted.startsWith('0')) {
    // Convert 0XXXXXXXXX to +254XXXXXXXXX
    return `+254${formatted.substring(1)}`
  } else if (formatted.length === 9) {
    // Assume it's a 9-digit number without country code
    return `+254${formatted}`
  }

  // If already in correct format or international, add + if missing
  if (!formatted.startsWith('+')) {
    return `+${formatted}`
  }

  return formatted
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  const formatted = formatPhoneNumber(phone)

  // Kenya phone number validation: +254 followed by 9 digits
  const kenyaRegex = /^\+254\d{9}$/

  if (!kenyaRegex.test(formatted)) {
    return {
      valid: false,
      error: 'Invalid phone number format. Must be Kenya format: +254XXXXXXXXX',
    }
  }

  return { valid: true }
}

/**
 * Send SMS via Africa's Talking API
 */
export async function sendSMS(
  config: AfricasTalkingConfig,
  request: SendSMSRequest
): Promise<SendSMSResponse> {
  try {
    // 1. Format recipients
    const recipients = Array.isArray(request.recipients)
      ? request.recipients.map(formatPhoneNumber)
      : [formatPhoneNumber(request.recipients)]

    // Validate all phone numbers
    for (const recipient of recipients) {
      const validation = validatePhoneNumber(recipient)
      if (!validation.valid) {
        return {
          success: false,
          errorCode: 'INVALID_PHONE',
          errorMessage: validation.error || 'Invalid phone number format',
        }
      }
    }

    const smsClient = ensureSmsChannel(config)
    const sendPayload: { to: string; message: string; from?: string } = {
      to: recipients.join(','),
      message: request.message,
    }
    if (request.senderId || config.senderId) {
      sendPayload.from = request.senderId || config.senderId
    }

    const response = await smsClient.send(sendPayload)
    const smsData = response?.SMSMessageData

    if (!smsData) {
      return {
        success: false,
        errorCode: 'NO_RESPONSE',
        errorMessage: 'No SMSMessageData returned from Africa\'s Talking.',
      }
    }

    return {
      success: true,
      messageId: smsData.Recipients?.[0]?.messageId,
      recipients: smsData.Recipients?.map((recipient: any) => ({
        statusCode: recipient.statusCode || 0,
        number: recipient.number,
        status: recipient.status || 'Unknown',
        cost: recipient.cost || '0',
        messageId: recipient.messageId || '',
      })),
    }
  } catch (error) {
    const err = error as Error
    console.error('Error sending SMS via Africa\'s Talking:', err)
    return {
      success: false,
      errorCode: 'EXCEPTION',
      errorMessage: err.message || 'Failed to send SMS',
    }
  }
}

/**
 * Get Africa's Talking config from environment
 */
function envFallback(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.length > 0) {
      return value
    }
  }
  return undefined
}

export function getAfricasTalkingConfig(): AfricasTalkingConfig {
  const apiKey = envFallback('AFRICAS_TALKING_API_KEY', 'AT_API_KEY', 'AT_SANDBOX_API_KEY')
  const username = envFallback('AFRICAS_TALKING_USERNAME', 'AT_USERNAME', 'AT_SANDBOX_USERNAME') || 'sandbox'
  const senderId = envFallback('AFRICAS_TALKING_SENDER_ID', 'AT_SMS_SHORTCODE', 'AT_SHORTCODE')
  const environment = (envFallback('AFRICAS_TALKING_ENVIRONMENT', 'AT_ENVIRONMENT') as 'sandbox' | 'production') || 'sandbox'

  if (!apiKey) {
    throw new Error("Africa's Talking API key is not configured. Set AFRICAS_TALKING_API_KEY or AT_API_KEY.")
  }

  return {
    apiKey,
    username,
    senderId,
    environment,
  }
}

/**
 * Check if Africa's Talking is configured
 */
export function isAfricasTalkingConfigured(): boolean {
  const apiKey = envFallback('AFRICAS_TALKING_API_KEY', 'AT_API_KEY', 'AT_SANDBOX_API_KEY')
  const username = envFallback('AFRICAS_TALKING_USERNAME', 'AT_USERNAME', 'AT_SANDBOX_USERNAME')
  return !!(apiKey && username)
}
