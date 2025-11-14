
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
function getBaseUrl(environment: 'sandbox' | 'production'): string {
  if (environment === 'production') {
    return 'https://api.africastalking.com'
  }
  return 'https://api.sandbox.africastalking.com'
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

    // 2. Prepare request
    const baseUrl = getBaseUrl(config.environment)
    const sendUrl = `${baseUrl}/version1/messaging`

    const requestBody: {
      username: string
      message: string
      to: string
      from?: string
    } = {
      username: config.username,
      message: request.message,
      to: recipients.join(','),
    }

    // Add sender ID if provided (production only)
    if (request.senderId || config.senderId) {
      requestBody.from = request.senderId || config.senderId
    }

    // 3. Make API request
    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        ApiKey: config.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(
        Object.entries(requestBody).reduce((acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = String(value)
          }
          return acc
        }, {} as Record<string, string>)
      ).toString(),
    })

    const responseData = await response.json()

    if (!response.ok) {
      return {
        success: false,
        errorCode: responseData.errorCode || String(response.status),
        errorMessage:
          responseData.errorMessage ||
          responseData.error ||
          'Failed to send SMS',
      }
    }

    // 4. Parse response
    // Africa's Talking returns different formats for single vs bulk
    if (responseData.SMSMessageData) {
      const smsData = responseData.SMSMessageData

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
    }

    // Fallback for different response format
    return {
      success: true,
      messageId: responseData.messageId || responseData.id,
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
export function getAfricasTalkingConfig(): AfricasTalkingConfig {
  return {
    apiKey: process.env.AFRICAS_TALKING_API_KEY!,
    username: process.env.AFRICAS_TALKING_USERNAME!,
    senderId: process.env.AFRICAS_TALKING_SENDER_ID,
    environment: (process.env.AFRICAS_TALKING_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  }
}

/**
 * Check if Africa's Talking is configured
 */
export function isAfricasTalkingConfigured(): boolean {
  const apiKey = process.env.AFRICAS_TALKING_API_KEY
  const username = process.env.AFRICAS_TALKING_USERNAME
  return !!(apiKey && username)
}

