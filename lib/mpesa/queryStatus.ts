import { getAccessToken, DarajaConfig } from './daraja'
import { generateTimestamp, generatePassword, encryptSecurityCredential } from './encrypt'

export interface TransactionStatusQueryRequest {
  transactionId: string // Receipt number or checkout request ID
  initiatorName?: string
  securityCredential?: string // For production, encrypted. For sandbox, can be plain
}

export interface TransactionStatusQueryResponse {
  success: boolean
  resultCode?: number
  resultDesc?: string
  transactionStatus?: string
  errorCode?: string
  errorMessage?: string
  responseData?: any
}

/**
 * Query transaction status from Daraja API
 * Uses /transactionstatus/v1/query endpoint
 */
export async function queryTransactionStatus(
  config: DarajaConfig,
  request: TransactionStatusQueryRequest
): Promise<TransactionStatusQueryResponse> {
  try {
    // 1. Get access token
    const accessToken = await getAccessToken(
      config.consumerKey,
      config.consumerSecret,
      config.environment
    )

    // 2. Prepare security credential
    // For sandbox: use plain password
    // For production: use encrypted security credential
    let securityCredential: string

    if (config.environment === 'production') {
      // For production, use encrypted security credential
      // This should be pre-encrypted and stored in env var
      if (request.securityCredential) {
        securityCredential = request.securityCredential
      } else if (process.env.MPESA_SECURITY_CREDENTIAL) {
        securityCredential = process.env.MPESA_SECURITY_CREDENTIAL
      } else {
        // Fallback: generate password (for sandbox compatibility)
        const timestamp = generateTimestamp()
        securityCredential = generatePassword(
          config.businessShortCode,
          config.passKey,
          timestamp
        )
      }
    } else {
      // For sandbox, use plain password
      const timestamp = generateTimestamp()
      securityCredential = generatePassword(
        config.businessShortCode,
        config.passKey,
        timestamp
      )
    }

    // 3. Prepare query request
    const queryUrl = `${config.environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'}/mpesa/transactionstatus/v1/query`

    const initiatorName = request.initiatorName || process.env.MPESA_INITIATOR_NAME || 'testapi'

    const requestBody = {
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'TransactionStatusQuery',
      PartyA: config.businessShortCode,
      IdentifierType: 4, // 4 = Organization shortcode
      Remarks: 'Auto-verification query',
      QueueTimeOutURL: config.callbackUrl,
      TransactionID: request.transactionId,
      ResultURL: config.callbackUrl, // Some implementations require this
    }

    // 4. Make query request
    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const responseData = await response.json()

    if (!response.ok) {
      return {
        success: false,
        errorCode: responseData.errorCode || String(response.status),
        errorMessage:
          responseData.errorMessage ||
          responseData.error_description ||
          'Failed to query transaction status',
        responseData: responseData,
      }
    }

    // 5. Parse response
    // Daraja returns different response structures
    // Check for ResultCode or ResponseCode
    const resultCode =
      responseData.ResultCode !== undefined
        ? responseData.ResultCode
        : responseData.ResponseCode !== undefined
          ? parseInt(responseData.ResponseCode)
          : null

    if (resultCode === null) {
      return {
        success: false,
        errorCode: 'UNKNOWN',
        errorMessage: 'Invalid response format from Daraja API',
        responseData: responseData,
      }
    }

    if (resultCode === 0) {
      // Success - transaction found and verified
      return {
        success: true,
        resultCode: 0,
        resultDesc: responseData.ResultDesc || responseData.ResponseDescription || 'Success',
        transactionStatus: responseData.TransactionStatus || 'Completed',
        responseData: responseData,
      }
    } else {
      // Failed or pending
      return {
        success: false,
        resultCode: resultCode,
        resultDesc: responseData.ResultDesc || responseData.ResponseDescription || 'Unknown error',
        transactionStatus: responseData.TransactionStatus || 'Failed',
        errorCode: String(resultCode),
        errorMessage: responseData.ResultDesc || responseData.ResponseDescription || 'Transaction query failed',
        responseData: responseData,
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('Error querying transaction status:', err)
    return {
      success: false,
      errorCode: 'EXCEPTION',
      errorMessage: err.message || 'Failed to query transaction status',
    }
  }
}

/**
 * Get Daraja config from environment
 */
export function getDarajaConfig(): DarajaConfig {
  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY!,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
    businessShortCode: process.env.MPESA_SHORTCODE || '174379',
    passKey: process.env.MPESA_PASSKEY!,
    callbackUrl: process.env.MPESA_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payments/mpesa/callback`,
    environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  }
}

