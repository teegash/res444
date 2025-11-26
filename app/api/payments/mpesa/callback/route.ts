import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCallbackData } from '@/lib/mpesa/daraja'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { processRentPrepayment } from '@/lib/payments/prepayment'
import { logNotification } from '@/lib/communications/notifications'

/**
 * M-Pesa Daraja API callback handler
 * This endpoint receives callbacks from Safaricom when payment is processed
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse callback data
    let callbackData: any
    try {
      callbackData = await request.json()
    } catch (error) {
      console.error('Error parsing callback data:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid callback data',
        },
        { status: 400 }
      )
    }

    // 2. Parse Daraja callback
    const parsed = parseCallbackData(callbackData as any)

    console.log('M-Pesa callback received:', {
      merchantRequestId: parsed.merchantRequestId,
      checkoutRequestId: parsed.checkoutRequestId,
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      receiptNumber: parsed.receiptNumber,
    })

    const supabase = await createClient()

    // 3. Find payment by checkout request ID
    // Note: Initially checkoutRequestId is stored in mpesa_receipt_number or notes
    // After callback, receipt number replaces it
    let payment = null

    // Try to find by receipt number first (if already updated)
    const { data: paymentByReceipt } = await supabase
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        months_paid,
        payment_date,
        notes,
        mpesa_receipt_number,
        invoices (
          id,
          amount,
          due_date,
          lease_id,
          invoice_type
        )
      `
      )
      .eq('mpesa_receipt_number', parsed.checkoutRequestId)
      .eq('payment_method', 'mpesa')
      .maybeSingle()

    if (paymentByReceipt) {
      payment = paymentByReceipt
    } else {
      // Try to find by notes (checkout request ID stored there initially)
      const { data: paymentByNotes } = await supabase
        .from('payments')
        .select(
          `
          id,
          invoice_id,
          tenant_user_id,
          amount_paid,
          months_paid,
          payment_date,
          notes,
          mpesa_receipt_number,
          invoices (
            id,
            amount,
            due_date,
            lease_id,
            invoice_type
          )
        `
        )
        .eq('payment_method', 'mpesa')
        .ilike('notes', `%${parsed.checkoutRequestId}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (paymentByNotes) {
        payment = paymentByNotes
      }
    }

    if (!payment) {
      console.error('Payment not found for checkout request:', parsed.checkoutRequestId)
      // Still return success to Daraja to acknowledge receipt
      return NextResponse.json({
        success: true,
        message: 'Callback received',
      })
    }

    // 4. Handle payment result
    if (parsed.resultCode === 0) {
      // Payment successful
      const invoice = payment.invoices as {
        id: string
        amount: number
        due_date: string | null
        lease_id: string
        invoice_type?: 'rent' | 'water'
      } | null

      if (!invoice) {
        console.error('Invoice not found for payment:', payment.id)
        return NextResponse.json({
          success: true,
          message: 'Callback received',
        })
      }

      // 5. Update payment record
      const updateData: {
        verified: boolean
        mpesa_receipt_number?: string
        mpesa_auto_verified?: boolean
        mpesa_verification_timestamp?: string
        mpesa_response_code?: string
        verified_at?: string
        notes?: string
      } = {
        verified: true,
        mpesa_auto_verified: true,
        mpesa_verification_timestamp: new Date().toISOString(),
        mpesa_response_code: String(parsed.resultCode),
        verified_at: new Date().toISOString(),
        notes: `M-Pesa payment verified. Receipt: ${parsed.receiptNumber || 'N/A'}`,
      }

      if (parsed.receiptNumber) {
        updateData.mpesa_receipt_number = parsed.receiptNumber
      }

      const { error: updateError } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', payment.id)

      if (updateError) {
        console.error('Error updating payment:', updateError)
        // Still return success to Daraja
        return NextResponse.json({
          success: true,
          message: 'Callback received',
        })
      }

      // 6. Update invoice coverage and status
      const monthsPaid = payment.months_paid || 1
      let primaryInvoiceId = invoice.id

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
          console.error('[MpesaCallback] Failed to process rent prepayment', prepaymentResult.validationErrors)
        } else {
          primaryInvoiceId = prepaymentResult.appliedInvoices[0] || invoice.id
        }
      } else {
        await supabase
          .from('invoices')
          .update({ months_covered: monthsPaid })
          .eq('id', invoice.id)

        await updateInvoiceStatus(invoice.id)
      }

      // 7. Send SMS confirmation (async, don't wait)
      sendPaymentConfirmationSMS(payment.tenant_user_id, {
        amount: parseFloat(payment.amount_paid.toString()),
        receiptNumber: parsed.receiptNumber || 'N/A',
        invoiceId: primaryInvoiceId,
      }).catch((error) => {
        console.error('Error sending SMS confirmation:', error)
        // Don't fail the callback if SMS fails
      })

      const typeLabel = invoice.invoice_type === 'water' ? 'Water bill' : 'Rent'
      await logNotification({
        senderUserId: null,
        recipientUserId: payment.tenant_user_id,
        messageText: `${typeLabel} payment of KES ${Number(payment.amount_paid).toLocaleString()} confirmed.`,
        relatedEntityType: 'payment',
        relatedEntityId: payment.id,
      })

      console.log('Payment verified successfully:', {
        paymentId: payment.id,
        receiptNumber: parsed.receiptNumber,
        amount: payment.amount_paid,
      })
    } else {
      // Payment failed
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          mpesa_response_code: String(parsed.resultCode),
          mpesa_query_status: parsed.resultDesc,
          notes: `M-Pesa payment failed: ${parsed.resultDesc}`,
          verified: false,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('Error updating failed payment:', updateError)
      }

      console.log('Payment failed:', {
        paymentId: payment.id,
        resultCode: parsed.resultCode,
        resultDesc: parsed.resultDesc,
      })
    }

    // 8. Always return success to Daraja (acknowledge receipt)
    return NextResponse.json({
      success: true,
      message: 'Callback processed',
    })
  } catch (error) {
    const err = error as Error
    console.error('Error processing M-Pesa callback:', err)

    // Still return success to Daraja to acknowledge receipt
    // We'll handle errors internally
    return NextResponse.json({
      success: true,
      message: 'Callback received',
    })
  }
}

/**
 * Send SMS confirmation to tenant
 */
async function sendPaymentConfirmationSMS(
  tenantUserId: string,
  paymentDetails: {
    amount: number
    receiptNumber: string
    invoiceId: string
  }
): Promise<void> {
  try {
    const supabase = await createClient()

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
    }).format(paymentDetails.amount)

    // Generate message
    const message = `RES: Your payment of ${formattedAmount} has been confirmed. Receipt: ${paymentDetails.receiptNumber}. Invoice #${paymentDetails.invoiceId.substring(0, 8)}. Thank you!`

    // Send SMS via Africa's Talking
    const { sendSMSWithLogging } = await import('@/lib/sms/smsService')
    
    await sendSMSWithLogging({
      phoneNumber: profile.phone_number,
      message: message,
      recipientUserId: tenantUserId,
      relatedEntityType: 'payment',
      relatedEntityId: paymentDetails.invoiceId,
    })
  } catch (error) {
    console.error('Error in sendPaymentConfirmationSMS:', error)
    // Don't throw - this is a non-critical operation
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      message: 'M-Pesa callback endpoint is active',
    },
    { status: 200 }
  )
}
