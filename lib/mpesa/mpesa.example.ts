/**
 * Example usage of M-Pesa payment integration
 * 
 * This file demonstrates how to use the M-Pesa payment endpoints
 */

// Example 1: Initiate M-Pesa payment from client-side
export async function initiateMpesaPayment(
  invoiceId: string,
  amount: number,
  phoneNumber: string
) {
  const response = await fetch('/api/payments/mpesa/initiate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Authorization header will be handled by middleware
    },
    body: JSON.stringify({
      invoice_id: invoiceId,
      amount: amount,
      phone_number: phoneNumber, // Format: +254712345678 or 0712345678
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('STK push initiated:', result.data)
    // {
    //   payment_id: "uuid",
    //   checkout_request_id: "ws_CO_123456789",
    //   merchant_request_id: "12345-67890-1",
    //   customer_message: "Success. Request accepted for processing",
    //   amount: 10000,
    //   phone_number: "254712345678"
    // }
    
    // Show message to user: "Please check your phone and enter your M-Pesa PIN"
  } else {
    console.error('Error:', result.error)
    // Handle error (e.g., insufficient funds, invalid phone, etc.)
  }

  return result
}

// Example 2: Error handling
export async function initiateMpesaPaymentWithErrorHandling(
  invoiceId: string,
  amount: number,
  phoneNumber: string
) {
  try {
    const response = await fetch('/api/payments/mpesa/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount: amount,
        phone_number: phoneNumber,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      
      // Handle different error types
      if (response.status === 401) {
        console.error('Unauthorized - please sign in')
      } else if (response.status === 403) {
        console.error('Forbidden - you can only pay for your own invoices')
      } else if (response.status === 404) {
        console.error('Invoice not found')
      } else if (response.status === 400) {
        console.error('Validation error:', error.error)
        // Invalid phone format, amount exceeds invoice, etc.
      } else if (response.status === 500) {
        console.error('Server error:', error.error)
      }
      
      return
    }

    const result = await response.json()
    if (result.success) {
      console.log('Success! Check your phone for STK prompt')
      // Show success message to user
    }
  } catch (error) {
    console.error('Network error:', error)
  }
}

// Example 3: Using from server action
export async function initiateMpesaPaymentServerAction(
  invoiceId: string,
  amount: number,
  phoneNumber: string
) {
  'use server'
  
  const { initiateSTKPush } = await import('./daraja')
  const { requireAuth } = await import('@/lib/rbac/routeGuards')
  const { createClient } = await import('@/lib/supabase/server')
  
  const { userId } = await requireAuth()
  
  // Get Daraja config
  const darajaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY!,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
    businessShortCode: process.env.MPESA_SHORTCODE || '174379',
    passKey: process.env.MPESA_PASSKEY!,
    callbackUrl: process.env.MPESA_CALLBACK_URL!,
    environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  }
  
  // Verify invoice and get details
  const supabase = await createClient()
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, amount, description')
    .eq('id', invoiceId)
    .single()
  
  if (!invoice) {
    return { success: false, error: 'Invoice not found' }
  }
  
  // Initiate STK push
  const result = await initiateSTKPush(darajaConfig, {
    invoiceId: invoice.id,
    amount: amount,
    phoneNumber: phoneNumber,
    accountReference: `INV-${invoice.id.substring(0, 8).toUpperCase()}`,
    transactionDesc: invoice.description || 'Rent Payment',
  })
  
  return result
}

// Example 4: Success response structure
export const successResponseExample = {
  success: true,
  message: 'Success. Request accepted for processing',
  data: {
    payment_id: 'uuid',
    checkout_request_id: 'ws_CO_12345678901234567890',
    merchant_request_id: '12345-67890-12345-67890',
    customer_message: 'Success. Request accepted for processing',
    amount: 10000,
    phone_number: '254712345678',
  },
}

// Example 5: Error response examples
export const errorExamples = {
  invalidPhone: {
    success: false,
    error: 'Invalid phone number format. Must be Kenya format: +254XXXXXXXXX',
  },
  invoiceNotFound: {
    success: false,
    error: 'Invoice not found',
  },
  notYourInvoice: {
    success: false,
    error: 'You can only pay for your own invoices',
  },
  amountExceeds: {
    success: false,
    error: 'Payment amount (KES 15000) cannot exceed invoice amount (KES 10000)',
  },
  stkPushFailed: {
    success: false,
    error: 'Failed to initiate M-Pesa payment',
    errorCode: '1032',
  },
  mpesaConfigMissing: {
    success: false,
    error: 'M-Pesa configuration is missing. Please contact support.',
  },
}

// Example 6: Callback data structure (from Daraja)
export const callbackDataExample = {
  Body: {
    stkCallback: {
      MerchantRequestID: '12345-67890-12345-67890',
      CheckoutRequestID: 'ws_CO_12345678901234567890',
      ResultCode: 0, // 0 = success, other = failure
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          {
            Name: 'Amount',
            Value: 10000,
          },
          {
            Name: 'MpesaReceiptNumber',
            Value: 'QGH123456789',
          },
          {
            Name: 'TransactionDate',
            Value: '20240201145000',
          },
          {
            Name: 'PhoneNumber',
            Value: '254712345678',
          },
        ],
      },
    },
  },
}

// Example 7: Payment flow in React component
export const PaymentFlowExample = `
import { useState } from 'react'

export function MpesaPaymentButton({ invoiceId, amount }) {
  const [loading, setLoading] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [message, setMessage] = useState('')

  const handlePayment = async () => {
    if (!phoneNumber) {
      setMessage('Please enter your phone number')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/payments/mpesa/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          amount: amount,
          phone_number: phoneNumber,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setMessage('Please check your phone and enter your M-Pesa PIN')
        // Show success message
      } else {
        setMessage(result.error || 'Payment failed')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        type="tel"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+254712345678"
      />
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'Processing...' : 'Pay with M-Pesa'}
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}
`

// Example 8: Environment variables needed
export const requiredEnvVars = {
  MPESA_CONSUMER_KEY: 'Your Daraja consumer key',
  MPESA_CONSUMER_SECRET: 'Your Daraja consumer secret',
  MPESA_SHORTCODE: '174379', // Sandbox: 174379, Production: Your shortcode
  MPESA_PASSKEY: 'Your Daraja passkey',
  MPESA_CALLBACK_URL: 'https://yourdomain.com/api/payments/mpesa/callback',
  MPESA_ENVIRONMENT: 'sandbox', // or 'production'
}

