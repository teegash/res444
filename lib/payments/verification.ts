'use server'

import { createClient } from '@/lib/supabase/server'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { logNotification } from '@/lib/communications/notifications'
import { processRentPrepayment, applyRentPayment } from '@/lib/payments/prepayment'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc } from '@/lib/invoices/rentPeriods'
import { sendPaymentStatusEmail } from '@/lib/email/sendPaymentStatusEmail'
import { getTemplateContent } from '@/lib/sms/templateStore'
import { renderTemplateContent } from '@/lib/sms/templateRenderer'

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
    if (!admin) {
      return {
        success: false,
        error: 'Server misconfigured: Admin client unavailable.',
      }
    }

    // 1. Validate invoice exists and user has access
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        lease_id,
        organization_id,
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
    const invoiceOrgId =
      invoice.organization_id || (invoice as any)?.leases?.unit?.building?.organization_id || null

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
        organization_id: invoiceOrgId,
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
    const buildingOrgId = invoiceOrgId
    if (buildingOrgId) {
      const { data: staff } = await admin
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', buildingOrgId)

      const allowedRoles = new Set(['admin', 'manager', 'caretaker'])
      const staffIds = Array.from(
        new Set(
          (staff || [])
            .filter((row: any) =>
              allowedRoles.has(String(row?.role || '').trim().toLowerCase())
            )
            .map((row: any) => row.user_id)
            .filter(Boolean)
        )
      )
      await Promise.all(
        staffIds.map((recipientId) =>
          logNotification({
            senderUserId: userId,
            recipientUserId: recipientId,
            messageText: `New bank deposit submitted for verification.`,
            relatedEntityType: 'payment',
            relatedEntityId: payment.id,
            organizationId: buildingOrgId,
          })
        )
      )
    }

    await logNotification({
      senderUserId: userId,
      recipientUserId: userId,
      messageText: 'Deposit slip submitted successfully. Management will verify your payment shortly.',
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      organizationId: buildingOrgId,
    })

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
    if (!admin) {
      return {
        success: false,
        error: 'Server misconfigured: Admin client unavailable.',
      }
    }

    // 1. Get payment details
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        organization_id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        verified,
        verified_by,
        verified_at,
        payment_date,
        months_paid,
        payment_method,
        bank_reference_number,
        applied_to_prepayment,
        batch_id,
        notes,
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

    const invoiceType = invoice.invoice_type || 'rent'
    const monthsPaid = payment.months_paid || 1
    const amountPaid = parseFloat(payment.amount_paid.toString())
    const invoiceAmount = invoice.amount ? parseFloat(invoice.amount.toString()) : 0
    const likelyPrepayment =
      invoiceType === 'rent' && (monthsPaid > 1 || (Number.isFinite(invoiceAmount) && amountPaid > invoiceAmount * 1.05))
    const paymentMethod =
      payment.payment_method === 'mpesa' ||
      payment.payment_method === 'bank_transfer' ||
      payment.payment_method === 'cash' ||
      payment.payment_method === 'cheque'
        ? payment.payment_method
        : 'bank_transfer'

    const existingNotes = typeof payment.notes === 'string' ? payment.notes : ''
    const managerNoteLine = request?.notes ? `[Verified by manager] ${request.notes}` : `[Verified by manager]`
    const notesWithManager =
      existingNotes.includes(managerNoteLine) ? existingNotes : `${existingNotes ? `${existingNotes}\n` : ''}${managerNoteLine}`

    const paymentDate =
      payment.payment_date && !Number.isNaN(new Date(payment.payment_date).getTime())
        ? new Date(payment.payment_date)
        : new Date()

    // 2. Already verified => allow safe repair for multi-month rent prepayments (common when earlier code paths skipped RPC)
    if (payment.verified) {
      if (invoiceType === 'rent' && monthsPaid > 1 && payment.applied_to_prepayment !== true) {
        // Ensure the manager note is persisted (without touching verified flags)
        if (notesWithManager !== existingNotes) {
          const { error: noteErr } = await admin.from('payments').update({ notes: notesWithManager }).eq('id', paymentId)
          if (noteErr) {
            return { success: false, error: `Failed to update payment notes: ${noteErr.message}` }
          }
        }

        const prepaymentResult = await processRentPrepayment({
          paymentId,
          leaseId: invoice.lease_id,
          tenantUserId: payment.tenant_user_id,
          amountPaid: parseFloat(payment.amount_paid.toString()),
          monthsPaid,
          paymentDate,
          paymentMethod,
        })

        if (!prepaymentResult.success) {
          return {
            success: false,
            error:
              prepaymentResult.message ||
              prepaymentResult.validationErrors?.[0] ||
              'Failed to apply rent prepayment.',
          }
        }

        const now = new Date().toISOString()
        // Stamp verifier (useful for auto-verified payments being repaired manually)
        await admin
          .from('payments')
          .update({
            verified_by: payment.verified_by || verifiedByUserId,
            verified_at: payment.verified_at || now,
          })
          .eq('id', paymentId)

        const primaryInvoiceId = prepaymentResult.appliedInvoices[0] || invoice.id

        await sendPaymentVerificationNotification(
          payment.organization_id,
          payment.tenant_user_id,
          primaryInvoiceId,
          parseFloat(payment.amount_paid.toString()),
          'approved',
          undefined,
          paymentMethod
        )

        await logNotification({
          senderUserId: verifiedByUserId,
          recipientUserId: payment.tenant_user_id,
          messageText: `Rent payment of KES ${Number(payment.amount_paid).toLocaleString()} confirmed.`,
          relatedEntityType: 'payment',
          relatedEntityId: paymentId,
          organizationId: payment.organization_id,
        })

        return {
          success: true,
          message: 'Payment was already verified; rent prepayment allocation has now been applied.',
          data: {
            payment_id: paymentId,
            invoice_id: primaryInvoiceId,
            amount: parseFloat(payment.amount_paid.toString()),
            verified: true,
          },
        }
      }

      return {
        success: false,
        error: 'Payment is already verified',
      }
    }

    // Fetch lease for coverage validation
    const { data: lease } = await admin
      .from('leases')
      .select('id, rent_paid_until')
      .eq('id', invoice.lease_id)
      .maybeSingle()

    if (lease?.rent_paid_until) {
      const dueMonth = startOfMonthUtc(new Date(invoice.due_date || new Date()))
      const paidUntil = startOfMonthUtc(new Date(lease.rent_paid_until))
      // For single-month payments, block double-paying a month already covered.
      // For multi-month prepayments, allow approving even if the linked invoice month is already covered,
      // because allocation starts from the next uncovered month (RPC handles this correctly).
      if (!likelyPrepayment && dueMonth <= paidUntil) {
        return {
          success: false,
          error: 'This month is already covered by a previous payment.',
        }
      }
    }

    // 3. Handle rent multi-month prepayments via RPC (source of truth)
    let primaryInvoiceId = invoice.id
    if (invoiceType === 'rent' && likelyPrepayment) {
      // Persist manager note first; RPC will read and preserve it while appending its own prepayment flag.
      if (notesWithManager !== existingNotes) {
        const { error: noteErr } = await admin.from('payments').update({ notes: notesWithManager }).eq('id', paymentId)
        if (noteErr) {
          return { success: false, error: `Failed to update payment notes: ${noteErr.message}` }
        }
      }

      const prepaymentResult = await processRentPrepayment({
        paymentId,
        leaseId: invoice.lease_id,
        tenantUserId: payment.tenant_user_id,
        amountPaid,
        monthsPaid,
        paymentDate,
        paymentMethod,
      })

      if (!prepaymentResult.success) {
        console.error('[approvePayment] prepayment allocation failed', {
          paymentId,
          leaseId: invoice.lease_id,
          monthsPaid,
          amountPaid,
          message: prepaymentResult.message,
          validationErrors: prepaymentResult.validationErrors,
        })
        return {
          success: false,
          error:
            prepaymentResult.message ||
            prepaymentResult.validationErrors?.[0] ||
            'Failed to apply rent prepayment.',
        }
      }

      const now = new Date().toISOString()
      const { error: verifierErr } = await admin
        .from('payments')
        .update({
          verified_by: verifiedByUserId,
          verified_at: now,
        })
        .eq('id', paymentId)

      if (verifierErr) {
        return { success: false, error: `Prepayment applied but failed to set verifier: ${verifierErr.message}` }
      }

      primaryInvoiceId = prepaymentResult.appliedInvoices[0] || invoice.id
    } else {
      // 3b. Single-month / non-prepayment flow: verify payment first, then update invoice + lease pointers
      const now = new Date().toISOString()
      const { error: updateError } = await admin
        .from('payments')
        .update({
          verified: true,
          verified_by: verifiedByUserId,
          verified_at: now,
          notes: notesWithManager,
        })
        .eq('id', paymentId)

      if (updateError) {
        console.error('Error updating payment:', updateError)
        return {
          success: false,
          error: 'Failed to update payment',
        }
      }

      if (invoiceType === 'rent') {
        // Apply rent coverage directly; trigger will mark invoice status
        await applyRentPayment(
          admin,
          { ...payment, id: paymentId, months_paid: monthsPaid },
          { id: invoice.id, due_date: invoice.due_date || new Date().toISOString().slice(0, 10) },
          lease || { id: invoice.lease_id }
        )
        primaryInvoiceId = invoice.id
      } else {
        // For non-rent, just ensure months_covered is stored; trigger handles status from verified payment
        await admin
          .from('invoices')
          .update({ months_covered: monthsPaid, payment_date: new Date().toISOString().slice(0, 10) })
          .eq('id', invoice.id)
      }
    }

    // 5. Send notification to tenant
    await sendPaymentVerificationNotification(
      payment.organization_id,
      payment.tenant_user_id,
      primaryInvoiceId,
      amountPaid,
      'approved',
      undefined,
      paymentMethod
    )

    const typeLabel = invoiceType === 'water' ? 'Water bill' : 'Rent'
    await logNotification({
      senderUserId: verifiedByUserId,
      recipientUserId: payment.tenant_user_id,
      messageText: `${typeLabel} payment of KES ${Number(amountPaid).toLocaleString()} confirmed.`,
      relatedEntityType: 'payment',
      relatedEntityId: paymentId,
      organizationId: payment.organization_id,
    })

    if (payment.payment_method === 'bank_transfer') {
      try {
        await sendPaymentStatusEmail({
          admin,
          organizationId: payment.organization_id,
          paymentId,
          invoiceId: primaryInvoiceId,
          tenantUserId: payment.tenant_user_id,
          kind: 'success',
          amountPaid,
          invoiceType,
          paymentMethod,
          receiptNumber: payment.bank_reference_number || null,
          occurredAtISO: new Date().toISOString(),
        })
      } catch (emailError) {
        console.error('[approvePayment] payment success email failed', emailError)
      }
    }

    return {
      success: true,
      message: 'Payment verified successfully',
      data: {
        payment_id: paymentId,
        invoice_id: primaryInvoiceId,
        amount: amountPaid,
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
    if (!admin) {
      return {
        success: false,
        error: 'Server misconfigured: Admin client unavailable.',
      }
    }

    // 1. Get payment details
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        organization_id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        verified,
        payment_method,
        bank_reference_number,
        deposit_slip_url,
        invoices (
          id,
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
        error: 'Cannot reject an already verified payment',
      }
    }

    const invoice = payment.invoices as { id: string; invoice_type?: 'rent' | 'water' } | null

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
        mpesa_query_status: 'rejected',
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
      payment.organization_id,
      payment.tenant_user_id,
      invoice.id,
      parseFloat(payment.amount_paid.toString()),
      'rejected',
      request.reason,
      payment.payment_method ?? 'bank_transfer'
    )

    if (payment.payment_method === 'bank_transfer') {
      try {
        await sendPaymentStatusEmail({
          admin,
          organizationId: payment.organization_id,
          paymentId,
          invoiceId: invoice.id,
          tenantUserId: payment.tenant_user_id,
          kind: 'failed',
          amountPaid: parseFloat(payment.amount_paid.toString()),
          invoiceType: invoice.invoice_type ?? null,
          paymentMethod: payment.payment_method ?? 'bank_transfer',
          receiptNumber: payment.bank_reference_number || null,
          resultDesc: request.reason,
          occurredAtISO: new Date().toISOString(),
        })
      } catch (emailError) {
        console.error('[rejectPayment] payment failed email failed', emailError)
      }
    }

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
  organizationId: string,
  tenantUserId: string,
  invoiceId: string,
  amount: number,
  status: 'approved' | 'rejected',
  reason?: string,
  paymentMethod?: string | null
): Promise<void> {
  try {
    const admin = createAdminClient()
    if (!admin) return

    // Get tenant phone number (admin client to bypass RLS and avoid null profile lookups)
    const { data: profile } = await admin
      .from('user_profiles')
      .select('phone_number, full_name')
      .eq('id', tenantUserId)
      .maybeSingle()

    // Fallback: try to read from auth.users metadata if profile missing
    let phoneNumber = profile?.phone_number || null
    let fullName = profile?.full_name || null

    if (!phoneNumber || !fullName) {
      const { data: authUser } = await admin.auth.admin.getUserById(tenantUserId)
      const meta = authUser?.user?.user_metadata || {}
      phoneNumber = phoneNumber || meta.phone || null
      fullName = fullName || meta.full_name || authUser?.user?.email || null
    }

    if (!phoneNumber) {
      console.warn('No profile/contact found for tenant:', tenantUserId)
      return
    }

    // Format amount
    const formattedAmount = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount)

    const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()

    const templateKey = status === 'approved' ? 'payment_verified' : 'payment_rejected'
    const template = await getTemplateContent(organizationId, templateKey)
    const paymentMethodLabel =
      paymentMethod === 'mpesa'
        ? 'M-Pesa'
        : paymentMethod === 'bank_transfer'
          ? 'Bank deposit'
          : paymentMethod === 'cash'
            ? 'Cash'
            : paymentMethod === 'cheque'
              ? 'Cheque'
              : paymentMethod || ''
    const reasonText = reason ? ` Reason: ${reason}.` : ''

    const message = renderTemplateContent(template, {
      '[AMOUNT]': formattedAmount,
      '[INVOICE_ID]': invoiceShortId,
      '[PAYMENT_METHOD]': paymentMethodLabel,
      '[REASON]': reason || '',
      '[REASON_TEXT]': reasonText,
    })
      .replace(/\s+/g, ' ')
      .trim()

    // Send SMS via Africa's Talking
    const { sendSMSWithLogging } = await import('@/lib/sms/smsService')
    
    await sendSMSWithLogging({
      phoneNumber,
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
