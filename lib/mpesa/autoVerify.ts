'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { queryTransactionStatus } from './queryStatus'
import { updateInvoiceStatus, calculateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { processRentPrepayment } from '@/lib/payments/prepayment'
import { getMpesaSettings, MpesaSettings } from '@/lib/mpesa/settings'
import { logNotification } from '@/lib/communications/notifications'
import { buildCallbackUrl, buildDarajaConfig, getMpesaCredentials } from '@/lib/mpesa/credentials'
import { getTemplateContent } from '@/lib/sms/templateStore'
import { renderTemplateContent } from '@/lib/sms/templateRenderer'

export interface PendingPayment {
  id: string
  organization_id: string
  invoice_id: string
  tenant_user_id: string
  amount_paid: number
  mpesa_checkout_request_id: string | null
  mpesa_receipt_number: string | null
  retry_count: number
  created_at: string
  last_status_check: string | null
  mpesa_initiated_at?: string | null
  mpesa_query_status?: string | null
  notes?: string | null
  months_paid?: number | null
  payment_date?: string | null
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
async function getPendingMpesaPayments(
  maxRetries: number,
  minIntervalSeconds: number,
  orgId?: string | null
): Promise<PendingPayment[]> {
  try {
    const supabase = createAdminClient()

    const intervalSeconds = Number.isFinite(minIntervalSeconds) && minIntervalSeconds > 0
      ? Math.max(30, Math.floor(minIntervalSeconds))
      : 60
    const thresholdIso = new Date(Date.now() - intervalSeconds * 1000).toISOString()

    // Query payments that:
    // 1. Are M-Pesa payments
    // 2. Not verified
    // 3. Have a checkout request id or receipt number
    // 4. Have not been checked recently (fallback verification)
    const query = supabase
      .from('payments')
      .select(
        'id, organization_id, invoice_id, tenant_user_id, amount_paid, mpesa_checkout_request_id, mpesa_receipt_number, retry_count, created_at, last_status_check, mpesa_initiated_at, mpesa_query_status, notes, months_paid, payment_date'
      )
      .eq('payment_method', 'mpesa')
      .eq('verified', false)
      .or('mpesa_checkout_request_id.not.is.null,mpesa_receipt_number.not.is.null')
      .or(`last_status_check.is.null,last_status_check.lt.${thresholdIso}`)
      .lt('retry_count', maxRetries)
      .order('created_at', { ascending: true })
      .limit(25)

    if (orgId) {
      query.eq('organization_id', orgId)
    }

    const { data: payments, error } = await query

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
  organizationId: string,
  tenantUserId: string,
  amount: number,
  invoiceId: string,
  receiptNumber: string
): Promise<void> {
  try {
    const supabase = createAdminClient()
    if (!supabase) return

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

    const template = await getTemplateContent(organizationId, 'payment_confirmed')
    const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()
    const receiptText = receiptNumber ? ` Receipt: ${receiptNumber}.` : ''
    const message = renderTemplateContent(template, {
      '[AMOUNT]': formattedAmount,
      '[PAYMENT_METHOD]': 'M-Pesa',
      '[INVOICE_ID]': invoiceShortId,
      '[RECEIPT_NUMBER]': receiptNumber,
      '[RECEIPT_TEXT]': receiptText,
    })
      .replace(/\s+/g, ' ')
      .trim()

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
  organizationId: string,
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
      organization_id: organizationId,
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
  config: ReturnType<typeof buildDarajaConfig>,
  maxRetries: number,
  opts?: { initiatorName?: string | null; securityCredential?: string | null }
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

    // 2. Use receipt when present, otherwise checkout request id
    const receiptNumber = payment.mpesa_receipt_number || null
    const transactionId = receiptNumber || payment.mpesa_checkout_request_id || null

    if (!transactionId) {
      return {
        success: false,
        verified: false,
        error: 'No checkout request ID found for transaction query',
      }
    }

    // 3. Query transaction status using transaction ID
    const queryResult = await queryTransactionStatus(config, {
      transactionId: transactionId,
      initiatorName: opts?.initiatorName || undefined,
      securityCredential: opts?.securityCredential || undefined,
    })

    // 4. Create audit log
    await createAuditLog(payment.organization_id, payment.id, queryResult)

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
        .select('id, amount, due_date, lease_id, invoice_type')
        .eq('id', payment.invoice_id)
        .single()

      if (invoice) {
        const rawMonthsPaid = Number(payment.months_paid || 1)
        const monthsPaid =
          Number.isFinite(rawMonthsPaid) && rawMonthsPaid > 0 ? Math.min(12, Math.floor(rawMonthsPaid)) : 1
        let invoiceStatus = false
        let targetInvoiceId = invoice.id

        if (invoice.invoice_type === 'rent') {
          const prepaymentResult = await processRentPrepayment({
            paymentId: payment.id,
            leaseId: invoice.lease_id,
            tenantUserId: payment.tenant_user_id,
            amountPaid: Number(payment.amount_paid),
            monthsPaid,
            paymentDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
            paymentMethod: 'mpesa',
          })

          if (!prepaymentResult.success) {
            console.error('[MpesaAutoVerify] Failed to process rent prepayment', prepaymentResult.validationErrors)
          } else {
            targetInvoiceId = prepaymentResult.appliedInvoices[0] || invoice.id
            await updateInvoiceStatus(targetInvoiceId)
            invoiceStatus = await calculateInvoiceStatus(targetInvoiceId)
          }
        } else {
          await supabase
            .from('invoices')
            .update({ months_covered: monthsPaid })
            .eq('id', invoice.id)

          await updateInvoiceStatus(invoice.id)
          invoiceStatus = await calculateInvoiceStatus(invoice.id)
        }

        if (invoiceStatus) {
          await sendPaymentConfirmationSMS(
            payment.organization_id,
            payment.tenant_user_id,
            parseFloat(payment.amount_paid.toString()),
            targetInvoiceId,
            receiptNumber || transactionId
          )

          const typeLabel = invoice.invoice_type === 'water' ? 'Water bill' : 'Rent'
          await logNotification({
            senderUserId: null,
            recipientUserId: payment.tenant_user_id,
            messageText: `${typeLabel} payment of KES ${Number(payment.amount_paid).toLocaleString()} confirmed.`,
            relatedEntityType: 'payment',
            relatedEntityId: payment.id,
            organizationId: payment.organization_id,
          })
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
      const fallbackReason =
        queryResult.resultDesc ||
        queryResult.errorMessage ||
        (resultCode === 1037 ? 'M-Pesa request timed out' : `Auto verification error (code ${resultCode})`)
      // Update retry count
      const updateData: {
        retry_count: number
        mpesa_query_status?: string
        notes?: string
      } = {
        retry_count: newRetryCount,
        mpesa_query_status: fallbackReason,
      }

      // If max retries reached, mark for manual review
      if (newRetryCount >= maxRetries) {
        const reason = fallbackReason || 'Timeout'
        updateData.notes = `${payment.mpesa_checkout_request_id ? `CheckoutRequestID: ${payment.mpesa_checkout_request_id}. ` : ''}Auto-verification failed after ${maxRetries} attempts. Reason: ${reason}.`
        if (!fallbackReason) {
          updateData.mpesa_query_status = `Auto verification timed out after ${maxRetries} attempts`
        }
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
export async function autoVerifyMpesaPayments(
  settingsOverride?: MpesaSettings,
  orgId?: string | null
): Promise<AutoVerifyResult> {
  try {
    const settings = settingsOverride ?? (await getMpesaSettings(orgId))

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

    // Get pending payments
    const pendingPayments = await getPendingMpesaPayments(
      settings.max_retries,
      settings.auto_verify_frequency_seconds,
      orgId
    )

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

    const paymentsByOrg = new Map<string, PendingPayment[]>()
    for (const payment of pendingPayments) {
      if (!payment.organization_id) {
        errorCount++
        errors.push({ payment_id: payment.id, error: 'Missing organization_id on payment.' })
        continue
      }
      const list = paymentsByOrg.get(payment.organization_id) || []
      list.push(payment)
      paymentsByOrg.set(payment.organization_id, list)
    }

    const admin = createAdminClient()
    if (!admin) {
      return {
        success: false,
        checked_count: 0,
        verified_count: 0,
        failed_count: 0,
        pending_count: 0,
        skipped_count: 0,
        error_count: pendingPayments.length,
        payments_auto_verified: [],
        errors: pendingPayments.map((payment) => ({
          payment_id: payment.id,
          error: 'Supabase admin client unavailable',
        })),
      }
    }

    for (const [groupOrgId, groupPayments] of paymentsByOrg.entries()) {
      let creds: Awaited<ReturnType<typeof getMpesaCredentials>> | null = null
      try {
        creds = await getMpesaCredentials(groupOrgId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load M-Pesa credentials.'
        errorCount += groupPayments.length
        errors.push({ payment_id: 'config', error: message })
        continue
      }
      if (!creds || !creds.isEnabled) {
        skippedCount += groupPayments.length
        continue
      }

      const callbackUrl = buildCallbackUrl(groupOrgId, creds.callbackSecret)
      const config = buildDarajaConfig(creds, callbackUrl)

      if (!config.consumerKey || !config.consumerSecret || !config.passKey) {
        errorCount += groupPayments.length
        errors.push({
          payment_id: 'config',
          error: `Missing M-Pesa credentials for organization ${groupOrgId}`,
        })
        continue
      }

      for (const payment of groupPayments) {
        try {
          checkedCount++

          const baseTime = payment.mpesa_initiated_at || payment.created_at
          const initiatedAt = baseTime ? Date.parse(baseTime) : NaN
          if (Number.isFinite(initiatedAt)) {
            const ageMs = Date.now() - initiatedAt
            const tenMinutesMs = 10 * 60 * 1000
            const thirtyMinutesMs = 30 * 60 * 1000
            const statusLower = String(payment.mpesa_query_status || '').toLowerCase()

            if (ageMs >= thirtyMinutesMs) {
              if (!statusLower.includes('expired')) {
                await admin
                  .from('payments')
                  .update({
                    mpesa_query_status: 'expired (30m)',
                    last_status_check: new Date().toISOString(),
                  })
                  .eq('id', payment.id)
              }
              failedCount++
              continue
            }

            if (ageMs >= tenMinutesMs) {
              if (!statusLower.includes('timeout')) {
                await admin
                  .from('payments')
                  .update({
                    mpesa_query_status: 'timeout (10m)',
                    last_status_check: new Date().toISOString(),
                  })
                  .eq('id', payment.id)
              }
              pendingCount++
              continue
            }
          }

          if (payment.retry_count >= settings.max_retries) {
            skippedCount++
            continue
          }

          const result = await verifyPayment(payment, config, settings.max_retries, {
            initiatorName: creds.initiatorName,
            securityCredential: creds.securityCredential,
          })

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
            const resultCode = result.resultCode || 1
            if (resultCode === 17) {
              pendingCount++
            } else {
              failedCount++
            }
          } else {
            errorCount++
            errors.push({
              payment_id: payment.id,
              error: result.error || 'Unknown error',
            })
          }

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
