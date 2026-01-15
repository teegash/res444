import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCallbackData } from '@/lib/mpesa/daraja'
import { processRentPrepayment } from '@/lib/payments/prepayment'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { logNotification } from '@/lib/communications/notifications'
import { getMpesaCredentials } from '@/lib/mpesa/credentials'

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Callback endpoint is live' }, { status: 200 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; secret: string } }
) {
  const startedAt = Date.now()
  const orgId = params?.orgId?.trim()
  const secret = params?.secret?.trim()

  const okAck = () =>
    NextResponse.json({ success: true, message: 'Callback received' }, { status: 200 })

  try {
    const admin = createAdminClient()

    if (orgId && admin) {
      const { error: inboundAuditErr } = await admin.from('mpesa_callback_audit').insert({
        organization_id: orgId,
        raw_payload: { inbound: true, headers: Object.fromEntries(request.headers.entries()) },
        received_at: new Date().toISOString(),
      })
      if (inboundAuditErr) {
        console.error('[MpesaCallback] inbound audit insert failed', inboundAuditErr)
      }
    }

    if (!orgId || !secret) return okAck()

    const creds = await getMpesaCredentials(orgId)
    if (!creds || !creds.isEnabled) return okAck()
    if (String(creds.callbackSecret) !== String(secret)) return okAck()

    let callbackData: any
    try {
      callbackData = await request.json()
    } catch {
      const { error: parseAuditErr } = await admin.from('mpesa_callback_audit').insert({
        organization_id: orgId,
        raw_payload: { parse_error: 'invalid_json' },
        received_at: new Date().toISOString(),
      })
      if (parseAuditErr) {
        console.error('[MpesaCallback] parse audit insert failed', parseAuditErr)
      }
      return okAck()
    }

    const parsed = parseCallbackData(callbackData as any)

    const { error: auditErr } = await admin.from('mpesa_callback_audit').insert({
      organization_id: orgId,
      merchant_request_id: parsed.merchantRequestId || null,
      checkout_request_id: parsed.checkoutRequestId || null,
      result_code: Number.isFinite(parsed.resultCode) ? parsed.resultCode : null,
      result_desc: parsed.resultDesc || null,
      receipt_number: parsed.receiptNumber || null,
      amount: parsed.amount ?? null,
      phone_number: parsed.phoneNumber || null,
      raw_payload: callbackData,
      received_at: new Date().toISOString(),
    })
    if (auditErr) {
      console.error('[MpesaCallback] audit insert failed', auditErr)
    }

    if (!parsed.checkoutRequestId) {
      return okAck()
    }

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select(
        `
          id,
          organization_id,
          invoice_id,
          tenant_user_id,
          amount_paid,
          months_paid,
          payment_date,
          verified,
          mpesa_checkout_request_id,
          invoices (
            id,
            lease_id,
            invoice_type
          )
        `
      )
      .eq('organization_id', orgId)
      .eq('payment_method', 'mpesa')
      .eq('mpesa_checkout_request_id', parsed.checkoutRequestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (payErr) {
      console.error('[MpesaCallback] payment lookup failed', payErr)
    }
    if (payErr || !payment) {
      return okAck()
    }

    const nowIso = new Date().toISOString()

    const { error: updateErr } = await admin
      .from('payments')
      .update({
        mpesa_merchant_request_id: parsed.merchantRequestId || null,
        mpesa_response_code: parsed.resultCode !== undefined ? String(parsed.resultCode) : null,
        mpesa_query_status: parsed.resultDesc || null,
        mpesa_receipt_number: parsed.receiptNumber || null,
        mpesa_phone_number: parsed.phoneNumber || null,
      })
      .eq('id', payment.id)
    if (updateErr) {
      console.error('[MpesaCallback] payment update failed', updateErr)
    }

    if (parsed.resultCode === 0) {
      if (!payment.verified) {
        const { error: verifyErr } = await admin
          .from('payments')
          .update({
            verified: true,
            verified_at: nowIso,
            mpesa_auto_verified: true,
            mpesa_verification_timestamp: nowIso,
          })
          .eq('id', payment.id)
        if (verifyErr) {
          console.error('[MpesaCallback] payment verify update failed', verifyErr)
        }
      }

      const invoice = payment.invoices as
        | { id: string; lease_id: string; invoice_type: 'rent' | 'water' | string }
        | null

      if (invoice) {
        const monthsPaidRaw = Number(payment.months_paid ?? 1)
        const monthsPaid =
          Number.isFinite(monthsPaidRaw) && monthsPaidRaw > 0
            ? Math.min(12, Math.floor(monthsPaidRaw))
            : 1

        if (invoice.invoice_type === 'rent') {
          await processRentPrepayment({
            paymentId: payment.id,
            leaseId: invoice.lease_id,
            tenantUserId: payment.tenant_user_id,
            amountPaid: Number(payment.amount_paid),
            monthsPaid,
            paymentDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
            paymentMethod: 'mpesa',
          })
        } else {
          await updateInvoiceStatus(invoice.id)
        }
      }

      await logNotification({
        senderUserId: null,
        recipientUserId: payment.tenant_user_id,
        messageText: `Payment of KES ${Number(payment.amount_paid).toLocaleString()} confirmed.`,
        relatedEntityType: 'payment',
        relatedEntityId: payment.id,
      })

      sendPaymentConfirmationSMS(payment.tenant_user_id, {
        amount: Number(payment.amount_paid),
        receiptNumber: parsed.receiptNumber || 'N/A',
        invoiceId: payment.invoice_id,
      }).catch(() => {})
    }

    return okAck()
  } catch {
    return okAck()
  } finally {
    const ms = Date.now() - startedAt
    if (ms > 1500) {
      console.warn('[MpesaCallback] slow callback handler', { orgId, ms })
    }
  }
}

async function sendPaymentConfirmationSMS(
  tenantUserId: string,
  paymentDetails: { amount: number; receiptNumber: string; invoiceId: string }
) {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('phone_number')
    .eq('id', tenantUserId)
    .single()

  if (!profile?.phone_number) return

  const formattedAmount = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(paymentDetails.amount)

  const message = `RES: Your payment of ${formattedAmount} has been confirmed. Receipt: ${paymentDetails.receiptNumber}. Invoice #${paymentDetails.invoiceId.substring(0, 8)}. Thank you!`

  const { sendSMSWithLogging } = await import('@/lib/sms/smsService')

  await sendSMSWithLogging({
    phoneNumber: profile.phone_number,
    message,
    recipientUserId: tenantUserId,
    relatedEntityType: 'payment',
    relatedEntityId: paymentDetails.invoiceId,
  })
}
