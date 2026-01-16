import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { createClient } from '@/lib/supabase/server'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'
import { logNotification } from '@/lib/communications/notifications'
import { processRentPrepayment } from '@/lib/payments/prepayment'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
    }

    const { invoice_id, amount, months_covered, card_name, card_number, card_expiry, card_cvv } = body as {
      invoice_id?: string
      amount?: number
      months_covered?: number
      card_name?: string
      card_number?: string
      card_expiry?: string
      card_cvv?: string
    }

    if (!invoice_id || !amount) {
      return NextResponse.json({ success: false, error: 'invoice_id and amount are required.' }, { status: 400 })
    }

    const monthsCoveredRaw = Number(months_covered)
    const monthsCovered = Number.isFinite(monthsCoveredRaw)
      ? Math.min(12, Math.max(1, Math.trunc(monthsCoveredRaw)))
      : 1

    const supabase = await createClient()
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(
        `
        id,
        amount,
        invoice_type,
        status,
        due_date,
        organization_id,
        lease:leases (
          id,
          tenant_user_id,
          rent_paid_until
        )
      `
      )
      .eq('id', invoice_id)
      .maybeSingle()

    if (invoiceError || !invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 })
    }

    const lease = invoice.lease as { id: string; tenant_user_id: string; rent_paid_until: string | null } | null
    if (!lease || lease.tenant_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'You can only pay your own invoices.' }, { status: 403 })
    }

    if (invoice.status) {
      return NextResponse.json({ success: false, error: 'Invoice already paid.' }, { status: 400 })
    }

    const invoiceAmount = Number(invoice.amount)
    const expectedAmount = invoiceAmount * monthsCovered
    if (Math.abs(amount - expectedAmount) > 0.01) {
      return NextResponse.json(
        { success: false, error: `Amount must equal ${monthsCovered} month(s) of rent: KES ${expectedAmount}.` },
        { status: 400 }
      )
    }

    const maskedCard = card_number ? card_number.replace(/.(?=.{4})/g, '•') : undefined

    const now = new Date().toISOString()
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        invoice_id,
        organization_id: invoice.organization_id,
        tenant_user_id: userId,
        amount_paid: amount,
        payment_method: 'card',
        verified: true,
        verified_by: userId,
        verified_at: now,
        months_paid: monthsCovered,
        notes: `Card payment processed${maskedCard ? ` (${maskedCard})` : ''}.`,
      })
      .select('id')
      .single()

    if (paymentError || !payment) {
      throw paymentError || new Error('Failed to record payment')
    }

    let primaryInvoiceId = invoice_id
    if (invoice.invoice_type === 'rent') {
      const prepaymentResult = await processRentPrepayment({
        paymentId: payment.id,
        leaseId: lease.id,
        tenantUserId: userId,
        amountPaid: amount,
        monthsPaid: monthsCovered,
        paymentDate: new Date(now),
        paymentMethod: 'card',
      })

      if (!prepaymentResult.success) {
        console.error('[CardPayment] Failed to apply rent prepayment', prepaymentResult.validationErrors)
        return NextResponse.json(
          { success: false, error: 'Payment recorded but rent allocation failed. Please contact support.' },
          { status: 500 }
        )
      }

      primaryInvoiceId = prepaymentResult.appliedInvoices[0] || invoice_id
    } else {
      await supabase.from('invoices').update({ months_covered: monthsCovered }).eq('id', invoice_id)
      await updateInvoiceStatus(invoice_id)
    }

    const typeLabel = invoice.invoice_type === 'water' ? 'Water bill' : 'Rent'
    await logNotification({
      senderUserId: userId,
      recipientUserId: userId,
      messageText: `${typeLabel} payment of KES ${Number(amount).toLocaleString()} confirmed.`,
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      organizationId: invoice.organization_id,
    })

    return NextResponse.json({
      success: true,
      message: 'Card payment recorded successfully.',
      data: { payment_id: payment.id, amount, months_covered: monthsCovered },
    })
  } catch (error) {
    console.error('[CardPayment] Failed to process card payment', error)
    return NextResponse.json({ success: false, error: 'Failed to process card payment.' }, { status: 500 })
  }
}
