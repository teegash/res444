import { NextRequest, NextResponse } from 'next/server'
import { getSmsClient } from '@/lib/africasTalking'

const KE_COUNTRY_CODE = '+254'

function normalizePhoneNumber(raw: string | null | undefined) {
  if (!raw) return null
  let sanitized = raw.replace(/[\s-]/g, '')
  if (sanitized.startsWith('0')) {
    sanitized = `${KE_COUNTRY_CODE}${sanitized.slice(1)}`
  }
  if (!sanitized.startsWith('+')) {
    sanitized = `+${sanitized}`
  }
  const isValid = /^\+\d{7,15}$/.test(sanitized)
  return isValid ? sanitized : null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    const {
      tenantName,
      tenantPhone,
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

    const normalizedPhone = normalizePhoneNumber(tenantPhone)
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Tenant phone number is missing or invalid. Use an international format such as +254707694388.',
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

    const sms = getSmsClient()
    const senderId = process.env.AT_SMS_SHORTCODE || 'sandbox'

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

    await sms.send({
      to: [normalizedPhone],
      message,
      from: senderId,
    })

    return NextResponse.json({ success: true })
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
