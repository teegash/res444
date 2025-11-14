import { generateTimestamp, generatePassword } from './encrypt'

export interface DarajaConfig {
  consumerKey: string
  consumerSecret: string
  businessShortCode: string
  passKey: string
  callbackUrl: string
  environment: 'sandbox' | 'production'
}

export interface STKPushRequest {
  invoiceId: string
  amount: number
  phoneNumber: string
  accountReference: string
  transactionDesc: string
}

export interface STKPushResponse {
  success: boolean
  checkoutRequestId?: string
  customerMessage?: string
  errorCode?: string
  errorMessage?: string
  merchantRequestId?: string
  responseCode?: string
  responseDescription?: string
}

export interface DarajaCallbackData {
  Body: {
    stkCallback: {
      MerchantRequestID: string
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: {
        Item: Array<{
          Name: string
          Value: string | number
        }>
      }
    }
  }
}

/**
 * Get Daraja API base URL based on environment
 */
function getBaseUrl(environment: 'sandbox' | 'production'): string {
  if (environment === 'production') {
    return 'https://api.safaricom.co.ke'
  }
  return 'https://sandbox.safaricom.co.ke'
}

/**
 * Get OAuth access token from Daraja API
 */
export async function getAccessToken(
  consumerKey: string,
  consumerSecret: string,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<string> {
  try {
    const baseUrl = getBaseUrl(environment)
    const authUrl = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`

    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    const response = await fetch(authUrl, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get access token: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`Daraja API error: ${data.error_description || data.error}`)
    }

    return data.access_token
  } catch (error) {
    const err = error as Error
    console.error('Error getting Daraja access token:', err)
    throw new Error(`Failed to get access token: ${err.message}`)
  }
}

/**
 * Initiate STK push payment
 */
export async function initiateSTKPush(
  config: DarajaConfig,
  request: STKPushRequest
): Promise<STKPushResponse> {
  try {
    // 1. Get access token
    const accessToken = await getAccessToken(
      config.consumerKey,
      config.consumerSecret,
      config.environment
    )

    // 2. Generate timestamp and password
    const timestamp = generateTimestamp()
    const password = generatePassword(
      config.businessShortCode,
      config.passKey,
      timestamp
    )

    // 3. Format phone number (ensure it starts with 254)
    let phoneNumber = request.phoneNumber.replace(/\s/g, '')
    if (phoneNumber.startsWith('+')) {
      phoneNumber = phoneNumber.substring(1)
    }
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '254' + phoneNumber.substring(1)
    }
    if (!phoneNumber.startsWith('254')) {
      phoneNumber = '254' + phoneNumber
    }

    // 4. Prepare STK push request
    const stkPushUrl = `${getBaseUrl(config.environment)}/mpesa/stkpush/v1/processrequest`

    const requestBody = {
      BusinessShortCode: config.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(request.amount), // Must be integer
      PartyA: phoneNumber,
      PartyB: config.businessShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: config.callbackUrl,
      AccountReference: request.accountReference,
      TransactionDesc: request.transactionDesc,
    }

    // 5. Make STK push request
    const response = await fetch(stkPushUrl, {
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
          'Failed to initiate STK push',
      }
    }

    // 6. Parse response
    if (responseData.ResponseCode === '0') {
      return {
        success: true,
        checkoutRequestId: responseData.CheckoutRequestID,
        customerMessage: responseData.CustomerMessage,
        merchantRequestId: responseData.MerchantRequestID,
        responseCode: responseData.ResponseCode,
        responseDescription: responseData.ResponseDescription,
      }
    } else {
      return {
        success: false,
        errorCode: responseData.ResponseCode,
        errorMessage: responseData.ResponseDescription || responseData.CustomerMessage,
        merchantRequestId: responseData.MerchantRequestID,
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('Error initiating STK push:', err)
    return {
      success: false,
      errorCode: 'ERROR',
      errorMessage: err.message || 'Failed to initiate STK push',
    }
  }
}

/**
 * Query transaction status
 */
export async function queryTransactionStatus(
  config: DarajaConfig,
  checkoutRequestId: string
): Promise<{
  success: boolean
  resultCode?: number
  resultDesc?: string
  errorCode?: string
  errorMessage?: string
}> {
  try {
    // Get access token
    const accessToken = await getAccessToken(
      config.consumerKey,
      config.consumerSecret,
      config.environment
    )

    // Generate timestamp and password
    const timestamp = generateTimestamp()
    const password = generatePassword(
      config.businessShortCode,
      config.passKey,
      timestamp
    )

    const queryUrl = `${getBaseUrl(config.environment)}/mpesa/stkpushquery/v1/query`

    const requestBody = {
      BusinessShortCode: config.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }

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
        errorMessage: responseData.errorMessage || 'Failed to query transaction',
      }
    }

    if (responseData.ResultCode === 0) {
      return {
        success: true,
        resultCode: responseData.ResultCode,
        resultDesc: responseData.ResultDesc,
      }
    } else {
      return {
        success: false,
        resultCode: responseData.ResultCode,
        resultDesc: responseData.ResultDesc,
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('Error querying transaction status:', err)
    return {
      success: false,
      errorCode: 'ERROR',
      errorMessage: err.message || 'Failed to query transaction status',
    }
  }
}

/**
 * Parse callback data from Daraja
 */
export function parseCallbackData(data: DarajaCallbackData): {
  merchantRequestId: string
  checkoutRequestId: string
  resultCode: number
  resultDesc: string
  receiptNumber?: string
  transactionDate?: string
  amount?: number
  phoneNumber?: string
} {
  const stkCallback = data.Body.stkCallback

  const result: {
    merchantRequestId: string
    checkoutRequestId: string
    resultCode: number
    resultDesc: string
    receiptNumber?: string
    transactionDate?: string
    amount?: number
    phoneNumber?: string
  } = {
    merchantRequestId: stkCallback.MerchantRequestID,
    checkoutRequestId: stkCallback.CheckoutRequestID,
    resultCode: stkCallback.ResultCode,
    resultDesc: stkCallback.ResultDesc,
  }

  // Extract callback metadata if successful
  if (stkCallback.ResultCode === 0 && stkCallback.CallbackMetadata) {
    const items = stkCallback.CallbackMetadata.Item

    for (const item of items) {
      switch (item.Name) {
        case 'MpesaReceiptNumber':
          result.receiptNumber = String(item.Value)
          break
        case 'TransactionDate':
          result.transactionDate = String(item.Value)
          break
        case 'Amount':
          result.amount = Number(item.Value)
          break
        case 'PhoneNumber':
          result.phoneNumber = String(item.Value)
          break
      }
    }
  }

  return result
}

