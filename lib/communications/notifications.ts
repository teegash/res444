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
    if (!adminSupabase) return
    let resolvedOrgId = organizationId
    if (!resolvedOrgId) {
      const { data: profile } = await adminSupabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', recipientUserId)
        .maybeSingle()
      resolvedOrgId = profile?.organization_id || null
    }
    if (!resolvedOrgId) {
      const { data: member } = await adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', recipientUserId)
        .maybeSingle()
      resolvedOrgId = member?.organization_id || null
    }
    const payload: Record<string, any> = {
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
      message_text: messageText,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      message_type: messageType,
      read: false,
    }
    if (resolvedOrgId) {
      payload.organization_id = resolvedOrgId
    }
    await adminSupabase.from('communications').insert(payload)
  } catch (error) {
    console.error('[notifications] Failed to log notification', error)
  }
}
