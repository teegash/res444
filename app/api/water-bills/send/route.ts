import { NextRequest, NextResponse } from 'next/server'
import { sendSMSWithLogging } from '@/lib/sms/smsService'
import { validatePhoneNumber } from '@/lib/sms/africasTalking'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    const {
      tenantName,
      tenantPhone,
      tenantUserId,
      unitId,
      propertyName,
      unitNumber,
      unitsConsumed,
      pricePerUnit,
      totalAmount,
      previousReading,
      currentReading,
      notes,
      dueDate,
    } = body || {}

    if (!tenantPhone) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tenant phone number is required.',
        },
        { status: 400 }
      )
    }

    const phoneValidation = validatePhoneNumber(tenantPhone)
    if (!phoneValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: phoneValidation.error || 'Phone number format is invalid.',
        },
        { status: 400 }
      )
    }

    if (!unitsConsumed || !totalAmount) {
      return NextResponse.json(
        { success: false, error: 'Invoice totals are missing. Please recalculate before sending.' },
        { status: 400 }
      )
    }

    const invoiceRef = `INV-${Date.now().toString().slice(-6)}`
    const formattedUnits = Number(unitsConsumed).toFixed(2)
    const formattedRate = Number(pricePerUnit || 0).toFixed(2)
    const formattedTotal = Number(totalAmount).toFixed(2)
    const dueDateDisplay =
      dueDate ||
      (() => {
        const date = new Date()
        date.setDate(date.getDate() + 7)
        return date.toISOString().split('T')[0]
      })()

    const message = [
      `Hello ${tenantName || 'tenant'},`,
      `Water bill for ${propertyName || 'your property'}${unitNumber ? ` (Unit ${unitNumber})` : ''}.`,
      `Prev: ${previousReading || '-'} | Curr: ${currentReading || '-'}.`,
      `Usage: ${formattedUnits} units @ KES ${formattedRate}. Total: KES ${formattedTotal}.`,
      `Due: ${dueDateDisplay}. Ref: ${invoiceRef}.`,
      notes ? `Note: ${notes.slice(0, 100)}` : '',
      'Thank you.'
    ]
      .filter(Boolean)
      .join(' ')

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const smsResult = await sendSMSWithLogging({
      phoneNumber: tenantPhone,
      message,
      senderUserId: user?.id,
      recipientUserId: tenantUserId,
      relatedEntityType: 'water_bill',
      relatedEntityId: unitId,
    })

    if (!smsResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: smsResult.error || 'Failed to send SMS invoice.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, data: { communicationId: smsResult.communicationId } })
  } catch (error) {
    console.error('[WaterBill.Send] Failed to send invoice SMS', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS invoice.',
      },
      { status: 500 }
    )
  }
}
