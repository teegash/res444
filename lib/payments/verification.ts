'use server'

import { createClient } from '@/lib/supabase/server'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { logNotification } from '@/lib/communications/notifications'
import { processRentPrepayment } from '@/lib/payments/prepayment'
import { createAdminClient } from '@/lib/supabase/admin'

export interface VerifyPaymentRequest {
  invoice_id: string
  amount: number
  payment_method: 'bank_transfer' | 'cash' | 'cheque'
  bank_reference_number?: string
  deposit_slip_url?: string
  notes?: string
  months_paid?: number
}

export interface VerifyPaymentResult {
  success: boolean
  message?: string
  error?: string
  data?: {
    payment_id: string
    invoice_id: string
    amount: number
    verified: boolean
  }
}

export interface ApprovePaymentRequest {
  notes?: string
}

export interface RejectPaymentRequest {
  reason: string
  notes?: string
}

/**
 * Create payment with deposit slip
 */
export async function createPaymentWithDepositSlip(
  userId: string,
  request: VerifyPaymentRequest
): Promise<VerifyPaymentResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // 1. Validate invoice exists and user has access
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        lease_id,
        leases (
          tenant_user_id,
          unit:apartment_units (
            building:apartment_buildings (
              id,
              organization_id
            )
          )
        )
      `
      )
      .eq('id', request.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return {
        success: false,
        error: 'Invoice not found',
      }
    }

    const lease = invoice.leases as { tenant_user_id: string } | null

    // 2. Verify user is the tenant for this invoice
    if (lease?.tenant_user_id !== userId) {
      return {
        success: false,
        error: 'You can only create payments for your own invoices',
      }
    }

    // 3. Validate amount
    const invoiceAmount = parseFloat(invoice.amount.toString())
    if (request.amount <= 0) {
      return {
        success: false,
        error: 'Payment amount must be greater than zero',
      }
    }

    const monthsPaid = Number.isFinite(request.months_paid) && request.months_paid && request.months_paid > 0
      ? Math.min(12, request.months_paid)
      : 1
    const expectedAmount = invoiceAmount * monthsPaid

    if (Math.abs(request.amount - expectedAmount) > 0.01) {
      return {
        success: false,
        error: `Payment amount must equal ${monthsPaid} month(s) of rent (KES ${expectedAmount}).`,
      }
    }

    // 4. Create payment record
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        invoice_id: request.invoice_id,
        tenant_user_id: userId,
        amount_paid: request.amount,
        payment_method: request.payment_method,
        bank_reference_number: request.bank_reference_number || null,
        deposit_slip_url: request.deposit_slip_url || null,
        verified: false, // Pending verification
        months_paid: monthsPaid,
        notes:
          request.notes ||
          `Payment submitted covering ${monthsPaid} month(s) with ${request.payment_method}. ${
            request.deposit_slip_url ? 'Deposit slip uploaded.' : ''
          }`,
      })
      .select('id')
      .single()

    if (paymentError || !payment) {
      console.error('Error creating payment:', paymentError)
      return {
        success: false,
        error: 'Failed to create payment record',
      }
    }

    // 5. Notify organization staff for review
    const buildingOrgId = (lease?.unit as any)?.building?.organization_id || null
    if (buildingOrgId) {
      const { data: staff } = await admin
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', buildingOrgId)
        .in('role', ['admin', 'manager', 'caretaker'])

      const staffIds = Array.from(new Set((staff || []).map((row: any) => row.user_id).filter(Boolean)))
      await Promise.all(
        staffIds.map((recipientId) =>
          logNotification({
            senderUserId: userId,
            recipientUserId: recipientId,
            messageText: `New bank deposit submitted for verification.`,
            relatedEntityType: 'payment',
            relatedEntityId: payment.id,
          })
        )
      )
    }

    return {
      success: true,
      message: 'Payment submitted successfully. Awaiting verification.',
      data: {
        payment_id: payment.id,
        invoice_id: request.invoice_id,
        amount: request.amount,
        verified: false,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in createPaymentWithDepositSlip:', err)
    return {
      success: false,
      error: err.message || 'Failed to create payment',
    }
  }
}

/**
 * Approve/verify a payment
 */
export async function approvePayment(
  paymentId: string,
  verifiedByUserId: string,
  request?: ApprovePaymentRequest
): Promise<VerifyPaymentResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // 1. Get payment details
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        verified,
        payment_date,
        months_paid,
        invoices (
          id,
          amount,
          due_date,
          lease_id,
          invoice_type
        )
      `
      )
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return {
        success: false,
        error: 'Payment not found',
      }
    }

    // 2. Check if already verified
    if (payment.verified) {
      return {
        success: false,
        error: 'Payment is already verified',
      }
    }

    const invoice = payment.invoices as {
      id: string
      amount: number
      lease_id: string
      due_date?: string | null
      invoice_type?: 'rent' | 'water'
    } | null

    if (!invoice) {
      return {
        success: false,
        error: 'Invoice not found for this payment',
      }
    }

    // 3. Update payment as verified
    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('payments')
      .update({
        verified: true,
        verified_by: verifiedByUserId,
        verified_at: now,
        notes: request?.notes
          ? `${payment.notes || ''}\n[Verified by manager] ${request.notes}`
          : `${payment.notes || ''}\n[Verified by manager]`,
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return {
        success: false,
        error: 'Failed to update payment',
      }
    }

    // 4. Update invoice status
    const monthsPaid = payment.months_paid || 1

    let primaryInvoiceId = invoice.id
    const invoiceType = invoice.invoice_type || 'rent'

    if (invoiceType === 'rent') {
      const prepaymentResult = await processRentPrepayment({
        paymentId: paymentId,
        leaseId: invoice.lease_id,
        tenantUserId: payment.tenant_user_id,
        amountPaid: Number(payment.amount_paid),
        monthsPaid,
        paymentDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
        paymentMethod: 'bank_transfer',
      })

      if (!prepaymentResult.success) {
      await admin
        .from('payments')
        .update({ verified: false, verified_by: null, verified_at: null })
        .eq('id', paymentId)

        return {
          success: false,
          error: 'Payment recorded but rent allocation failed. Please retry or contact support.',
        }
      }

      primaryInvoiceId = prepaymentResult.appliedInvoices[0] || invoice.id
    } else {
      await admin.from('invoices').update({ months_covered: monthsPaid }).eq('id', invoice.id)
      await updateInvoiceStatus(invoice.id)
    }

    // 5. Send notification to tenant
    await sendPaymentVerificationNotification(
      payment.tenant_user_id,
      primaryInvoiceId,
      parseFloat(payment.amount_paid.toString()),
      'approved'
    )

    const typeLabel = invoiceType === 'water' ? 'Water bill' : 'Rent'
    await logNotification({
      senderUserId: verifiedByUserId,
      recipientUserId: payment.tenant_user_id,
      messageText: `${typeLabel} payment of KES ${Number(payment.amount_paid).toLocaleString()} confirmed.`,
      relatedEntityType: 'payment',
      relatedEntityId: paymentId,
    })

    return {
      success: true,
      message: 'Payment verified successfully',
      data: {
        payment_id: paymentId,
        invoice_id: primaryInvoiceId,
        amount: parseFloat(payment.amount_paid.toString()),
        verified: true,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in approvePayment:', err)
    return {
      success: false,
      error: err.message || 'Failed to approve payment',
    }
  }
}

/**
 * Reject a payment
 */
export async function rejectPayment(
  paymentId: string,
  rejectedByUserId: string,
  request: RejectPaymentRequest
): Promise<VerifyPaymentResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // 1. Get payment details
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        verified,
        deposit_slip_url,
        invoices (
          id
        )
      `
      )
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return {
        success: false,
        error: 'Payment not found',
      }
    }

    // 2. Check if already verified
    if (payment.verified) {
      return {
        success: false,
        error: 'Cannot reject an already verified payment',
      }
    }

    const invoice = payment.invoices as { id: string } | null

    if (!invoice) {
      return {
        success: false,
        error: 'Invoice not found for this payment',
      }
    }

    // 3. Update payment with rejection
    const rejectionNotes = `[REJECTED] Reason: ${request.reason}. ${request.notes || ''}`
    const { error: updateError } = await admin
      .from('payments')
      .update({
        notes: `${payment.notes || ''}\n${rejectionNotes}`,
        verified: false,
        verified_by: null,
        verified_at: null,
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return {
        success: false,
        error: 'Failed to reject payment',
      }
    }

    // 4. Optionally delete deposit slip (or keep for audit)
    // For now, we'll keep it for audit purposes

    // 5. Send notification to tenant
    await sendPaymentVerificationNotification(
      payment.tenant_user_id,
      invoice.id,
      parseFloat(payment.amount_paid.toString()),
      'rejected',
      request.reason
    )

    return {
      success: true,
      message: 'Payment rejected successfully',
      data: {
        payment_id: paymentId,
        invoice_id: invoice.id,
        amount: parseFloat(payment.amount_paid.toString()),
        verified: false,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in rejectPayment:', err)
    return {
      success: false,
      error: err.message || 'Failed to reject payment',
    }
  }
}

/**
 * Send payment verification notification to tenant
 */
async function sendPaymentVerificationNotification(
  tenantUserId: string,
  invoiceId: string,
  amount: number,
  status: 'approved' | 'rejected',
  reason?: string
): Promise<void> {
  try {
    const supabase = await createClient()

    // Get tenant phone number
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('phone_number, full_name')
      .eq('id', tenantUserId)
      .single()

    if (!profile) {
      console.warn('No profile found for tenant:', tenantUserId)
      return
    }

    // Format amount
    const formattedAmount = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount)

    const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()

    // Generate message
    let message: string
    if (status === 'approved') {
      message = `RES: Your payment of ${formattedAmount} has been verified and approved. Invoice #${invoiceShortId} is now paid. Thank you!`
    } else {
      const reasonText = reason ? ` Reason: ${reason}.` : ''
      message = `RES: Your payment of ${formattedAmount} for Invoice #${invoiceShortId} has been rejected.${reasonText} Please contact support for assistance.`
    }

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
    console.error('Error sending payment verification notification:', error)
    // Don't throw - notification failure shouldn't break the process
  }
}
