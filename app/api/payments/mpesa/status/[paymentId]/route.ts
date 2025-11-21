import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        'id, tenant_user_id, verified, mpesa_query_status, mpesa_response_code, mpesa_auto_verified, mpesa_receipt_number, verified_at, notes'
      )
      .eq('id', paymentId)
      .maybeSingle()

    if (paymentError) {
      console.error('[MpesaStatus] Failed to load payment', paymentError)
      return NextResponse.json({ success: false, error: 'Failed to load payment status' }, { status: 500 })
    }

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
    }

    if (payment.tenant_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
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
