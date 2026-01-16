import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyRentPayment } from '@/lib/payments/prepayment'
import { processRentPrepayment } from '@/lib/payments/prepayment'
import { sendPaymentStatusEmail } from '@/lib/email/sendPaymentStatusEmail'

export async function GET(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { userId } = await requireAuth()
    const paymentId = params.paymentId

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'paymentId is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin unavailable.' },
        { status: 500 }
      )
    }
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle()

    if (paymentError) {
      console.error('[MpesaStatus] Failed to load payment', paymentError)
      return NextResponse.json({ success: false, error: 'Failed to load payment status' }, { status: 500 })
    }

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
    }

    if (payment.tenant_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const wasVerified = payment.verified === true
    let status: 'pending' | 'success' | 'failed' = 'pending'
    let message = payment.mpesa_query_status || 'Awaiting confirmation from Safaricom.'

    if (payment.verified || payment.mpesa_response_code === '0' || payment.mpesa_auto_verified === true) {
      status = 'success'
      message =
        payment.mpesa_receipt_number
          ? `Payment confirmed. Receipt: ${payment.mpesa_receipt_number}.`
          : 'Payment confirmed.'
    } else if (payment.mpesa_response_code && payment.mpesa_response_code !== '0') {
      status = 'failed'
      message = payment.mpesa_query_status || 'Payment failed. Please try again.'
    } else if (payment.mpesa_query_status) {
      const lowered = payment.mpesa_query_status.toLowerCase()
      if (
        lowered.includes('fail') ||
        lowered.includes('cancel') ||
        lowered.includes('timeout') ||
        lowered.includes('expired')
      ) {
        status = 'failed'
        message = payment.mpesa_query_status
      }
    }

    // If M-Pesa says success ensure invoice is applied/verified (including prepayment allocation)
    if (status === 'success') {
      const { data: invoice } = await admin
        .from('invoices')
        .select('*')
        .eq('id', payment.invoice_id)
        .maybeSingle()

      if (invoice?.invoice_type === 'rent' && invoice.lease_id) {
        // Idempotent: processRentPrepayment no-ops if already applied
        await processRentPrepayment({
          paymentId: payment.id,
          leaseId: invoice.lease_id,
          tenantUserId: payment.tenant_user_id,
          amountPaid: Number(payment.amount_paid),
          monthsPaid: payment.months_paid || 1,
          paymentDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
          paymentMethod: 'mpesa',
        })
      } else if (invoice?.lease_id && invoice.status !== true) {
        const { data: lease } = await admin.from('leases').select('*').eq('id', invoice.lease_id).maybeSingle()
        if (lease) {
          await applyRentPayment(admin, payment, invoice, lease)
        }
      }

      if (!payment.verified) {
        const nowIso = new Date().toISOString()
        const { error: verifyErr } = await admin
          .from('payments')
          .update({ verified: true, verified_at: nowIso })
          .eq('id', paymentId)
          .eq('verified', false)

        if (!verifyErr && !wasVerified) {
          try {
            await sendPaymentStatusEmail({
              admin,
              organizationId: payment.organization_id,
              paymentId: payment.id,
              invoiceId: payment.invoice_id,
              tenantUserId: payment.tenant_user_id,
              kind: 'success',
              amountPaid: payment.amount_paid,
              invoiceType: invoice?.invoice_type ?? null,
              paymentMethod: payment.payment_method ?? 'mpesa',
              receiptNumber: payment.mpesa_receipt_number || null,
              occurredAtISO: nowIso,
            })
          } catch (err) {
            console.error('[MpesaStatus] sendPaymentStatusEmail failed', err)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        status,
        message,
        mpesa_receipt_number: payment.mpesa_receipt_number,
        verified_at: payment.verified_at,
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('[MpesaStatus] Unexpected error', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch payment status' },
      { status: 500 }
    )
  }
}
