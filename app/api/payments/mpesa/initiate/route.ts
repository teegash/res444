import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { initiateSTKPush, DarajaConfig } from '@/lib/mpesa/daraja'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Parse request body
    let body: {
      invoice_id: string
      amount: number
      phone_number: string
    }

    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    // 3. Validate required fields
    if (!body.invoice_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'invoice_id is required',
        },
        { status: 400 }
      )
    }

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Valid amount is required',
        },
        { status: 400 }
      )
    }

    const monthsCoveredRaw = Number((body as any).months_covered)
    const monthsCovered = Number.isFinite(monthsCoveredRaw)
      ? Math.min(12, Math.max(1, Math.trunc(monthsCoveredRaw)))
      : 1

    if (!body.phone_number) {
      return NextResponse.json(
        {
          success: false,
          error: 'phone_number is required',
        },
        { status: 400 }
      )
    }

    // 4. Validate phone format (Kenya: +254XXXXXXXXX)
    const phoneRegex = /^\+?254\d{9}$/
    let phoneNumber = body.phone_number.replace(/\s/g, '')
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '254' + phoneNumber.substring(1)
    }
    if (!phoneNumber.startsWith('254')) {
      phoneNumber = '254' + phoneNumber
    }

    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid phone number format. Must be Kenya format: +254XXXXXXXXX',
        },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 5. Verify invoice exists and user has access
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(
        `
        id,
        amount,
        status,
        lease_id,
        description,
        leases (
          tenant_user_id,
          apartment_units (
            unit_number,
            apartment_buildings (
              name
            )
          )
        )
      `
      )
      .eq('id', body.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invoice not found',
        },
        { status: 404 }
      )
    }

    const lease = invoice.leases as {
      tenant_user_id: string
      apartment_units: {
        unit_number: string
        apartment_buildings: { name: string } | null
      } | null
    } | null

    // 6. Verify user is the tenant for this invoice
    if (lease?.tenant_user_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'You can only pay for your own invoices',
        },
        { status: 403 }
      )
    }

    if (invoice.status) {
      return NextResponse.json(
        {
          success: false,
          error: 'This invoice is already marked as paid.',
        },
        { status: 400 }
      )
    }

    const invoiceAmount = parseFloat(invoice.amount.toString())
    const expectedAmount = invoiceAmount * monthsCovered
    if (Math.abs(body.amount - expectedAmount) > 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Payment amount must equal invoice total for ${monthsCovered} month(s): KES ${expectedAmount}.`,
        },
        { status: 400 }
      )
    }

    // 8. Get Daraja configuration
    const darajaConfig: DarajaConfig = {
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      businessShortCode: process.env.MPESA_SHORTCODE || '174379',
      passKey: process.env.MPESA_PASSKEY!,
      callbackUrl: process.env.MPESA_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payments/mpesa/callback`,
      environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    }

    // Validate required env vars
    if (!darajaConfig.consumerKey || !darajaConfig.consumerSecret || !darajaConfig.passKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'M-Pesa configuration is missing. Please contact support.',
        },
        { status: 500 }
      )
    }

    // 9. Create pending payment record
    const buildingName = lease?.apartment_units?.apartment_buildings?.name || 'Building'
    const unitNumber = lease?.apartment_units?.unit_number || 'N/A'
    const accountReference = `INV-${invoice.id.substring(0, 8).toUpperCase()}`
    const transactionDesc = `${invoice.description || 'Rent Payment'} - ${buildingName} Unit ${unitNumber}`

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        invoice_id: body.invoice_id,
        tenant_user_id: userId,
        amount_paid: body.amount,
        payment_method: 'mpesa',
        verified: false,
        months_paid: monthsCovered,
        notes: `M-Pesa payment initiated for ${transactionDesc} covering ${monthsCovered} month(s).`,
      })
      .select('id')
      .single()

    if (paymentError || !payment) {
      console.error('Error creating payment record:', paymentError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create payment record',
        },
        { status: 500 }
      )
    }

    // 10. Initiate STK push
    const stkResponse = await initiateSTKPush(darajaConfig, {
      invoiceId: body.invoice_id,
      amount: body.amount,
      phoneNumber: phoneNumber,
      accountReference: accountReference,
      transactionDesc: transactionDesc,
    })

    if (!stkResponse.success) {
      // Delete payment record if STK push failed
      await supabase.from('payments').delete().eq('id', payment.id)

      return NextResponse.json(
        {
          success: false,
          error: stkResponse.errorMessage || 'Failed to initiate M-Pesa payment',
          errorCode: stkResponse.errorCode,
        },
        { status: 400 }
      )
    }

    // 11. Update payment record with checkout request ID
    // Store checkout request ID in notes for callback lookup
    // The actual receipt number will be set by the callback
    await supabase
      .from('payments')
      .update({
        mpesa_receipt_number: stkResponse.checkoutRequestId || null, // Temporary storage
        notes: `STK push initiated. CheckoutRequestID: ${stkResponse.checkoutRequestId}. MerchantRequestID: ${stkResponse.merchantRequestId}`,
      })
      .eq('id', payment.id)

    // 12. Return success response
    return NextResponse.json({
      success: true,
      message: stkResponse.customerMessage || 'STK push initiated successfully',
      data: {
        payment_id: payment.id,
        checkout_request_id: stkResponse.checkoutRequestId,
        merchant_request_id: stkResponse.merchantRequestId,
        customer_message: stkResponse.customerMessage,
        amount: expectedAmount,
        phone_number: phoneNumber,
        months_covered: monthsCovered,
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error in M-Pesa initiate endpoint:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to initiate M-Pesa payment.',
    },
    { status: 405 }
  )
}
