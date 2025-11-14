import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { sendSMSWithLogging, sendSMSWithRetry } from '@/lib/sms/smsService'
import { formatPhoneNumber, validatePhoneNumber } from '@/lib/sms/africasTalking'

/**
 * Send SMS endpoint
 * Used for sending SMS messages via Africa's Talking
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Check permission (staff can send SMS)
    const canSend = await hasPermission(userId, 'communications:send')
    if (!canSend) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to send SMS',
        },
        { status: 403 }
      )
    }

    // 3. Parse request body
    let body: {
      phone_number: string
      message: string
      recipient_user_id?: string
      related_entity_type?: 'payment' | 'maintenance_request' | 'lease' | 'water_bill'
      related_entity_id?: string
      reminder_id?: string
      retry?: boolean
      max_retries?: number
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

    // 4. Validate required fields
    if (!body.phone_number) {
      return NextResponse.json(
        {
          success: false,
          error: 'phone_number is required',
        },
        { status: 400 }
      )
    }

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'message is required',
        },
        { status: 400 }
      )
    }

    // 5. Validate phone number
    const phoneValidation = validatePhoneNumber(body.phone_number)
    if (!phoneValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: phoneValidation.error || 'Invalid phone number format',
        },
        { status: 400 }
      )
    }

    // 6. Format phone number
    const formattedPhone = formatPhoneNumber(body.phone_number)

    // 7. Send SMS
    const sendFunction = body.retry
      ? sendSMSWithRetry
      : sendSMSWithLogging

    const result = await sendFunction(
      {
        phoneNumber: formattedPhone,
        message: body.message.trim(),
        recipientUserId: body.recipient_user_id,
        relatedEntityType: body.related_entity_type,
        relatedEntityId: body.related_entity_id,
        reminderId: body.reminder_id,
      },
      body.max_retries || 3
    )

    if (!result.success) {
      // Determine status code
      let statusCode = 400
      if (result.error?.includes('not configured')) {
        statusCode = 503 // Service unavailable
      } else if (result.error?.includes('INVALID_PHONE')) {
        statusCode = 400
      } else {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }

    // 8. Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'SMS sent successfully',
        data: {
          message_id: result.messageId,
          phone_number: formattedPhone,
          communication_id: result.communicationId,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Error in send SMS endpoint:', err)

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
      error: 'Method not allowed. Use POST to send SMS.',
    },
    { status: 405 }
  )
}

