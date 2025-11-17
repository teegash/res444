'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS, getAfricasTalkingConfig, isAfricasTalkingConfigured, formatPhoneNumber } from './africasTalking'

const SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000'

export interface SendSMSOptions {
  phoneNumber: string
  message: string
  senderUserId?: string
  recipientUserId?: string
  relatedEntityType?: 'payment' | 'maintenance_request' | 'lease' | 'water_bill'
  relatedEntityId?: string
  reminderId?: string
}

export interface SendSMSResult {
  success: boolean
  messageId?: string
  error?: string
  communicationId?: string
}

/**
 * Send SMS and log to database
 */
export async function sendSMSWithLogging(
  options: SendSMSOptions
): Promise<SendSMSResult> {
  try {
    const supabase = await createClient()

    // 1. Check if Africa's Talking is configured
    if (!isAfricasTalkingConfigured()) {
      console.warn('Africa\'s Talking not configured, logging SMS without sending')

      const senderId = options.senderUserId || SYSTEM_SENDER_ID
      const recipientId = options.recipientUserId || null
      
      // Still log to database but mark as not sent
      const { data: communication } = await supabase
        .from('communications')
        .insert({
          sender_user_id: senderId,
          recipient_user_id: recipientId,
          related_entity_type: options.relatedEntityType || null,
          related_entity_id: options.relatedEntityId || null,
          message_text: options.message,
          message_type: 'sms',
          read: false,
          sent_via_africas_talking: false,
        })
        .select('id')
        .single()

      return {
        success: false,
        error: 'Africa\'s Talking not configured',
        communicationId: communication?.id,
      }
    }

    // 2. Format phone number
    const formattedPhone = formatPhoneNumber(options.phoneNumber)

    // 3. Get config and send SMS
    const config = getAfricasTalkingConfig()
    const smsResult = await sendSMS(config, {
      message: options.message,
      recipients: formattedPhone,
      senderId: config.senderId,
    })

    // 4. Log to communications table
    let communicationId: string | undefined

    const senderId = options.senderUserId || SYSTEM_SENDER_ID
    const recipientId = options.recipientUserId || null

    if (smsResult.success && smsResult.messageId) {
      const { data: communication } = await supabase
        .from('communications')
        .insert({
          sender_user_id: senderId,
          recipient_user_id: recipientId,
          related_entity_type: options.relatedEntityType || null,
          related_entity_id: options.relatedEntityId || null,
          message_text: options.message,
          message_type: 'sms',
          read: false,
          sent_via_africas_talking: true,
          africas_talking_message_id: smsResult.messageId,
        })
        .select('id')
        .single()

      communicationId = communication?.id

      // 5. Update reminder if provided
      if (options.reminderId) {
        await supabase
          .from('reminders')
          .update({
            sent_at: new Date().toISOString(),
            delivery_status: 'sent',
            sent_via_africas_talking: true,
          })
          .eq('id', options.reminderId)
      }
    } else {
      // Log failed attempt
      const { data: communication } = await supabase
        .from('communications')
        .insert({
          sender_user_id: senderId,
          recipient_user_id: recipientId,
          related_entity_type: options.relatedEntityType || null,
          related_entity_id: options.relatedEntityId || null,
          message_text: options.message,
          message_type: 'sms',
          read: false,
          sent_via_africas_talking: false,
        })
        .select('id')
        .single()

      communicationId = communication?.id

      // Update reminder as failed
      if (options.reminderId) {
        await supabase
          .from('reminders')
          .update({
            delivery_status: 'failed',
            sent_via_africas_talking: false,
          })
          .eq('id', options.reminderId)
      }
    }

    return {
      success: smsResult.success,
      messageId: smsResult.messageId,
      error: smsResult.errorMessage,
      communicationId,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in sendSMSWithLogging:', err)
    return {
      success: false,
      error: err.message || 'Failed to send SMS',
    }
  }
}

/**
 * Send SMS with retry logic
 */
export async function sendSMSWithRetry(
  options: SendSMSOptions,
  maxRetries: number = 3
): Promise<SendSMSResult> {
  let lastError: string | undefined
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++
    const result = await sendSMSWithLogging(options)

    if (result.success) {
      return result
    }

    lastError = result.error

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10 seconds
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  return {
    success: false,
    error: lastError || `Failed after ${maxRetries} attempts`,
  }
}

/**
 * Get user phone number from user ID
 */
export async function getUserPhoneNumber(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('phone_number')
      .eq('id', userId)
      .single()

    return profile?.phone_number || null
  } catch (error) {
    console.error('Error getting user phone number:', error)
    return null
  }
}
