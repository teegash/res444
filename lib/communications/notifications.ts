import { createAdminClient } from '@/lib/supabase/admin'

type NotificationPayload = {
  senderUserId: string | null
  recipientUserId: string
  messageText: string
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  messageType?: 'in_app' | 'sms'
  organizationId?: string | null
}

/**
 * Persist an in-app notification to the communications table.
 * Errors are logged but do not interrupt the calling workflow.
 */
export async function logNotification({
  senderUserId,
  recipientUserId,
  messageText,
  relatedEntityType = null,
  relatedEntityId = null,
  messageType = 'in_app',
  organizationId = null,
}: NotificationPayload) {
  if (!recipientUserId || !messageText) {
    return
  }

  try {
    const adminSupabase = createAdminClient()
    const payload: Record<string, any> = {
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
      message_text: messageText,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      message_type: messageType,
      read: false,
    }
    if (organizationId) {
      payload.organization_id = organizationId
    }
    await adminSupabase.from('communications').insert(payload)
  } catch (error) {
    console.error('[notifications] Failed to log notification', error)
  }
}
