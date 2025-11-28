import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyRentPayment } from '@/lib/payments/prepayment'

export async function GET(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
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

    let status: 'pending' | 'success' | 'failed' = 'pending'
    let message = payment.mpesa_query_status || 'Awaiting confirmation from Safaricom.'

    if (payment.verified) {
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
      if (lowered.includes('fail') || lowered.includes('cancel') || lowered.includes('timeout')) {
        status = 'failed'
        message = payment.mpesa_query_status
      }
    }

    // If M-Pesa says success ensure invoice is applied/verified
    if (status === 'success') {
      const { data: invoice } = await admin
        .from('invoices')
        .select('*')
        .eq('id', payment.invoice_id)
        .maybeSingle()

      if (invoice?.lease_id && invoice.status !== true) {
        const { data: lease } = await admin.from('leases').select('*').eq('id', invoice.lease_id).maybeSingle()
        if (lease) {
          await applyRentPayment(admin, payment, invoice, lease)
        }
      }

      if (!payment.verified) {
        await admin
          .from('payments')
          .update({ verified: true, verified_at: new Date().toISOString() })
          .eq('id', paymentId)
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
