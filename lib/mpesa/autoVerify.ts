'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { queryTransactionStatus, getDarajaConfig } from './queryStatus'
import { updateInvoiceStatus, calculateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { calculatePaidUntil } from '@/lib/payments/leaseHelpers'
import { getMpesaSettings, MpesaSettings } from '@/lib/mpesa/settings'

export interface PendingPayment {
  id: string
  invoice_id: string
  tenant_user_id: string
  amount_paid: number
  mpesa_receipt_number: string | null
  retry_count: number
  created_at: string
  last_status_check: string | null
  notes?: string | null
}

export interface AutoVerifyResult {
  success: boolean
  checked_count: number
  verified_count: number
  failed_count: number
  pending_count: number
  skipped_count: number
  error_count: number
  payments_auto_verified: Array<{
    payment_id: string
    amount: number
    status: string
    timestamp: string
    receipt_number?: string
  }>
  errors?: Array<{
    payment_id: string
    error: string
  }>
}

/**
 * Get pending M-Pesa payments that need verification
 * Criteria: verified = FALSE, payment_method = 'mpesa', created > 24 hours ago
 */
async function getPendingMpesaPayments(maxRetries: number): Promise<PendingPayment[]> {
  try {
    const supabase = createAdminClient()

    // Calculate 24 hours ago
    // Query payments that:
    // 1. Are M-Pesa payments
    // 2. Not verified
    // 3. Created more than 24 hours ago
    // 4. Have a receipt number OR checkout request ID in notes
    const { data: payments, error } = await supabase
      .from('payments')
      .select('id, invoice_id, tenant_user_id, amount_paid, mpesa_receipt_number, retry_count, created_at, last_status_check, notes')
      .eq('payment_method', 'mpesa')
      .eq('verified', false)
      .or('mpesa_receipt_number.not.is.null,notes.ilike.%CheckoutRequestID%')
      .lt('retry_count', maxRetries) // Only get payments that haven't exceeded max retries
      .order('created_at', { ascending: true })
      .limit(100) // Limit to prevent overwhelming the API

    if (error) {
      console.error('Error fetching pending payments:', error)
      return []
    }

    return (payments || []) as PendingPayment[]
  } catch (error) {
    console.error('Error in getPendingMpesaPayments:', error)
    return []
  }
}

/**
 * Send SMS confirmation to tenant
 */
async function sendPaymentConfirmationSMS(
  tenantUserId: string,
  amount: number,
  invoiceId: string,
  receiptNumber: string
): Promise<void> {
  try {
    const supabase = createAdminClient()

    // Get tenant phone number
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('phone_number')
      .eq('id', tenantUserId)
      .single()

    if (!profile?.phone_number) {
      console.warn('No phone number found for tenant:', tenantUserId)
      return
    }

    // Format amount
    const formattedAmount = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount)

    // Generate message
    const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()
    const message = `Your payment of ${formattedAmount} has been confirmed by M-Pesa. Invoice #${invoiceShortId} is now paid. Receipt: ${receiptNumber}. Thank you!`

    // Send SMS via Africa's Talking
    const { sendSMSWithLogging } = await import('@/lib/sms/smsService')
    
    await sendSMSWithLogging({
      phoneNumber: profile.phone_number,
      message: message,
      recipientUserId: tenantUserId,
      relatedEntityType: 'payment',
      relatedEntityId: invoiceId,
    })
  } catch (error) {
    console.error('Error in sendPaymentConfirmationSMS:', error)
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Create audit log entry
 */
async function createAuditLog(
  paymentId: string,
  queryResult: {
    resultCode?: number
    resultDesc?: string
    transactionStatus?: string
    responseData?: any
  }
): Promise<void> {
  try {
    const supabase = createAdminClient()

    await supabase.from('mpesa_verification_audit').insert({
      payment_id: paymentId,
      query_timestamp: new Date().toISOString(),
      response_code: queryResult.resultCode !== undefined ? String(queryResult.resultCode) : null,
      result_description: queryResult.resultDesc || null,
      transaction_status: queryResult.transactionStatus || null,
      daraja_response: queryResult.responseData || null,
    })
  } catch (error) {
    console.error('Error creating audit log:', error)
    // Don't throw - audit logging failure shouldn't break the process
  }
}

/**
 * Verify a single payment
 */
async function verifyPayment(
  payment: PendingPayment,
  config: ReturnType<typeof getDarajaConfig>,
  maxRetries: number
): Promise<{
  success: boolean
  verified: boolean
  error?: string
  resultCode?: number
}> {
  try {
    // 1. Check if payment already verified (race condition protection)
    const supabase = createAdminClient()
    const { data: currentPayment } = await supabase
      .from('payments')
      .select('verified, mpesa_receipt_number')
      .eq('id', payment.id)
      .single()

    if (currentPayment?.verified) {
      return {
        success: true,
        verified: false, // Already verified, skip
      }
    }

    // 2. Get receipt number (could be in mpesa_receipt_number or notes)
    let receiptNumber = payment.mpesa_receipt_number
    let transactionId = receiptNumber

    if (!receiptNumber) {
      // Try to extract from notes (payment object already has notes from query)
      if (payment.notes) {
        // Extract checkout request ID or receipt number from notes
        const checkoutMatch = payment.notes.match(/CheckoutRequestID:\s*(\w+)/i)
        const receiptMatch = payment.notes.match(/Receipt[:\s]+(\w+)/i)
        
        if (receiptMatch) {
          receiptNumber = receiptMatch[1]
          transactionId = receiptNumber
        } else if (checkoutMatch) {
          // Use checkout request ID as transaction ID
          transactionId = checkoutMatch[1]
        }
      }
    }

    // If still no transaction ID, try querying payment again
    if (!transactionId) {
      const { data: paymentWithNotes } = await supabase
        .from('payments')
        .select('notes, mpesa_receipt_number')
        .eq('id', payment.id)
        .single()

      if (paymentWithNotes) {
        if (paymentWithNotes.mpesa_receipt_number) {
          transactionId = paymentWithNotes.mpesa_receipt_number
          receiptNumber = paymentWithNotes.mpesa_receipt_number
        } else if (paymentWithNotes.notes) {
          const checkoutMatch = paymentWithNotes.notes.match(/CheckoutRequestID:\s*(\w+)/i)
          const receiptMatch = paymentWithNotes.notes.match(/Receipt[:\s]+(\w+)/i)
          
          if (receiptMatch) {
            transactionId = receiptMatch[1]
            receiptNumber = receiptMatch[1]
          } else if (checkoutMatch) {
            transactionId = checkoutMatch[1]
          }
        }
      }
    }

    if (!transactionId) {
      return {
        success: false,
        verified: false,
        error: 'No receipt number or checkout request ID found for transaction query',
      }
    }

    // 3. Query transaction status using transaction ID
    const queryResult = await queryTransactionStatus(config, {
      transactionId: transactionId,
    })

    // 4. Create audit log
    await createAuditLog(payment.id, queryResult)

    // 5. Update last_status_check
    await supabase
      .from('payments')
      .update({
        last_status_check: new Date().toISOString(),
        mpesa_query_status: queryResult.resultDesc || null,
        mpesa_response_code: queryResult.resultCode !== undefined ? String(queryResult.resultCode) : null,
      })
      .eq('id', payment.id)

    // 6. Handle result
    if (queryResult.success && queryResult.resultCode === 0) {
      // Payment verified successfully
      const now = new Date().toISOString()

      // Update payment
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          verified: true,
          mpesa_auto_verified: true,
          mpesa_verification_timestamp: now,
          mpesa_response_code: '0',
          verified_at: now,
          retry_count: 0, // Reset retry count on success
          mpesa_receipt_number: receiptNumber || transactionId, // Ensure receipt number is stored
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Error updating payment:', updateError)
        return {
          success: false,
          verified: false,
          error: `Failed to update payment: ${updateError.message}`,
        }
      }

      // Get invoice details
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, amount, due_date, lease_id')
        .eq('id', payment.invoice_id)
        .single()

      if (invoice) {
        // Calculate invoice status
        const invoiceStatus = await calculateInvoiceStatus(invoice.id)

        // Update invoice status
        await updateInvoiceStatus(invoice.id)

        const monthsPaid = payment.months_paid || 1
        await supabase
          .from('invoices')
          .update({ months_covered: monthsPaid })
          .eq('id', invoice.id)

        if (invoice.lease_id) {
          const { data: lease } = await supabase
            .from('leases')
            .select('id, rent_paid_until')
            .eq('id', invoice.lease_id)
            .maybeSingle()

          const nextPaidUntil = calculatePaidUntil(
            lease?.rent_paid_until || null,
            invoice.due_date || null,
            monthsPaid
          )

          if (nextPaidUntil) {
            await supabase
              .from('leases')
              .update({ rent_paid_until: nextPaidUntil })
              .eq('id', invoice.lease_id)
          }
        }

        // If invoice is fully paid, send SMS
        if (invoiceStatus) {
          await sendPaymentConfirmationSMS(
            payment.tenant_user_id,
            parseFloat(payment.amount_paid.toString()),
            invoice.id,
            receiptNumber || transactionId
          )
        }
      }

      return {
        success: true,
        verified: true,
        resultCode: 0,
      }
    } else {
      // Payment failed or pending
      const resultCode = queryResult.resultCode || 1
      const newRetryCount = payment.retry_count + 1
      // Update retry count
      const updateData: {
        retry_count: number
        mpesa_query_status?: string
        notes?: string
      } = {
        retry_count: newRetryCount,
        mpesa_query_status: queryResult.resultDesc || null,
      }

      // If max retries reached, mark for manual review
      if (newRetryCount >= maxRetries) {
        const reason = queryResult.resultDesc || queryResult.errorMessage || 'Timeout'
        updateData.notes = `${payment.mpesa_receipt_number ? `Receipt: ${payment.mpesa_receipt_number}. ` : ''}Auto-verification failed after ${maxRetries} attempts. Reason: ${reason}.`
      }

      await supabase.from('payments').update(updateData).eq('id', payment.id)

      return {
        success: true,
        verified: false,
        resultCode: resultCode,
        error: queryResult.resultDesc || queryResult.errorMessage || 'Transaction verification failed',
      }
    }
  } catch (error) {
    const err = error as Error
    console.error(`Error verifying payment ${payment.id}:`, err)
    return {
      success: false,
      verified: false,
      error: err.message || 'Failed to verify payment',
    }
  }
}

/**
 * Auto-verify pending M-Pesa payments
 */
export async function autoVerifyMpesaPayments(settingsOverride?: MpesaSettings): Promise<AutoVerifyResult> {
  try {
    const settings = settingsOverride ?? (await getMpesaSettings())

    if (!settings.auto_verify_enabled) {
      return {
        success: true,
        checked_count: 0,
        verified_count: 0,
        failed_count: 0,
        pending_count: 0,
        skipped_count: 0,
        error_count: 0,
        payments_auto_verified: [],
      }
    }

    // Get Daraja config
    const config = getDarajaConfig()

    // Validate config
    if (!config.consumerKey || !config.consumerSecret || !config.passKey) {
      console.error('M-Pesa configuration is missing')
      return {
        success: false,
        checked_count: 0,
        verified_count: 0,
        failed_count: 0,
        pending_count: 0,
        skipped_count: 0,
        error_count: 1,
        payments_auto_verified: [],
        errors: [
          {
            payment_id: 'config',
            error: 'M-Pesa configuration is missing',
          },
        ],
      }
    }

    // Get pending payments
    const pendingPayments = await getPendingMpesaPayments(settings.max_retries)

    if (pendingPayments.length === 0) {
      return {
        success: true,
        checked_count: 0,
        verified_count: 0,
        failed_count: 0,
        pending_count: 0,
        skipped_count: 0,
        error_count: 0,
        payments_auto_verified: [],
      }
    }

    let checkedCount = 0
    let verifiedCount = 0
    let failedCount = 0
    let pendingCount = 0
    let skippedCount = 0
    let errorCount = 0
    const verifiedPayments: AutoVerifyResult['payments_auto_verified'] = []
    const errors: Array<{ payment_id: string; error: string }> = []

    // Process each payment
    for (const payment of pendingPayments) {
      try {
        checkedCount++

        // Skip if already at max retries (will be handled separately)
        if (payment.retry_count >= settings.max_retries) {
          skippedCount++
          continue
        }

        // Verify payment
        const result = await verifyPayment(payment, config, settings.max_retries)

        if (result.verified) {
          verifiedCount++
          verifiedPayments.push({
            payment_id: payment.id,
            amount: parseFloat(payment.amount_paid.toString()),
            status: 'verified',
            timestamp: new Date().toISOString(),
            receipt_number: payment.mpesa_receipt_number || undefined,
          })
        } else if (result.success) {
          // Query was successful but payment not verified
          const resultCode = result.resultCode || 1

          if (resultCode === 17) {
            // Pending - will retry next cycle
            pendingCount++
          } else {
            // Failed
            failedCount++
          }
        } else {
          // Error during verification
          errorCount++
          errors.push({
            payment_id: payment.id,
            error: result.error || 'Unknown error',
          })
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        const err = error as Error
        errorCount++
        errors.push({
          payment_id: payment.id,
          error: err.message || 'Unexpected error',
        })
        console.error(`Error processing payment ${payment.id}:`, err)
      }
    }

    return {
      success: true,
      checked_count: checkedCount,
      verified_count: verifiedCount,
      failed_count: failedCount,
      pending_count: pendingCount,
      skipped_count: skippedCount,
      error_count: errorCount,
      payments_auto_verified: verifiedPayments,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in autoVerifyMpesaPayments:', err)
    return {
      success: false,
      checked_count: 0,
      verified_count: 0,
      failed_count: 0,
      pending_count: 0,
      skipped_count: 0,
      error_count: 1,
      payments_auto_verified: [],
      errors: [
        {
          payment_id: 'system',
          error: err.message || 'Failed to auto-verify payments',
        },
      ],
    }
  }
}
