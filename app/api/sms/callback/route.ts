import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Africa's Talking SMS Delivery Status Callback
 * 
 * This endpoint receives delivery status updates from Africa's Talking
 * when SMS messages are delivered or fail
 * 
 * Callback URL format: https://yourdomain.com/api/sms/callback
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse callback data
    let callbackData: any
    try {
      callbackData = await request.json()
    } catch (error) {
      // Try form data if JSON fails
      try {
        const formData = await request.formData()
        callbackData = Object.fromEntries(formData.entries())
      } catch (formError) {
        console.error('Error parsing callback data:', error)
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid callback data',
          },
          { status: 400 }
        )
      }
    }

    console.log('SMS delivery callback received:', callbackData)

    const supabase = await createClient()

    // 2. Extract callback information
    // Africa's Talking callback format may vary, handle both formats
    const messageId = callbackData.id || callbackData.requestId || callbackData.messageId
    const status = callbackData.status || callbackData.deliveryStatus
    const phoneNumber = callbackData.phoneNumber || callbackData.number
    const networkCode = callbackData.networkCode
    const failureReason = callbackData.failureReason || callbackData.reason

    if (!messageId) {
      console.warn('No message ID in callback:', callbackData)
      // Still return success to acknowledge receipt
      return NextResponse.json({
        success: true,
        message: 'Callback received',
      })
    }

    // 3. Find communication record by message ID
    const { data: communication, error: commError } = await supabase
      .from('communications')
      .select('id, recipient_user_id, related_entity_id, reminder_id')
      .eq('africas_talking_message_id', messageId)
      .maybeSingle()

    if (commError) {
      console.error('Error finding communication:', commError)
      // Still return success to acknowledge receipt
      return NextResponse.json({
        success: true,
        message: 'Callback received',
      })
    }

    // 4. Update communication record if found
    if (communication) {
      const updateData: {
        notes?: string
      } = {}

      // Add delivery status to notes
      const statusNote = `Delivery status: ${status}. ${phoneNumber ? `Phone: ${phoneNumber}.` : ''} ${networkCode ? `Network: ${networkCode}.` : ''} ${failureReason ? `Failure: ${failureReason}.` : ''}`
      updateData.notes = statusNote

      await supabase
        .from('communications')
        .update(updateData)
        .eq('id', communication.id)
    }

    // 5. Update reminder if linked
    if (communication?.related_entity_id) {
      // Try to find reminder by related entity
      const { data: reminder } = await supabase
        .from('reminders')
        .select('id')
        .eq('related_entity_id', communication.related_entity_id)
        .eq('delivery_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (reminder) {
        // Update reminder delivery status
        const reminderStatus = status === 'Delivered' || status === 'delivered' ? 'sent' : 'failed'

        await supabase
          .from('reminders')
          .update({
            delivery_status: reminderStatus,
            sent_at: reminderStatus === 'sent' ? new Date().toISOString() : null,
          })
          .eq('id', reminder.id)
      }
    }

    // 6. Always return success to acknowledge receipt
    return NextResponse.json({
      success: true,
      message: 'Callback processed',
      data: {
        message_id: messageId,
        status: status,
        processed: true,
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error processing SMS callback:', err)

    // Still return success to acknowledge receipt
    // We'll handle errors internally
    return NextResponse.json({
      success: true,
      message: 'Callback received',
    })
  }
}

// Handle GET for health checks
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'SMS delivery callback endpoint is active',
  })
}

