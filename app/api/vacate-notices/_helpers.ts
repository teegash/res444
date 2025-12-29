import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeUuid(input: string) {
  let decoded = String(input || '').trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // keep raw input if decoding fails
  }
  const match = decoded.match(UUID_RE)
  return match ? match[0] : ''
}

export async function requireManagerContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return {
      error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }),
    }
  }

  const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
  if (role && !MANAGER_ROLES.has(role)) {
    return {
      error: NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 }),
    }
  }

  return { user, organizationId: membership.organization_id, admin }
}

export async function fetchNoticeById(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  noticeId: string
) {
  const { data: notice, error } = await admin
    .from('tenant_vacate_notices')
    .select('*')
    .eq('id', noticeId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return notice || null
}

export async function logNoticeEvent(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    notice_id: string
    organization_id: string
    actor_user_id: string | null
    action: string
    metadata?: any
  }
) {
  const { error } = await admin.from('tenant_vacate_notice_events').insert({
    notice_id: args.notice_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id,
    action: args.action,
    metadata: args.metadata ?? {},
  })
  if (error) {
    throw new Error(error.message)
  }
}

export async function notifyTenant(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    tenantUserId: string
    organizationId: string
    noticeId: string
    message: string
    senderUserId?: string | null
  }
) {
  const { error } = await admin.from('communications').insert({
    sender_user_id: args.senderUserId ?? null,
    recipient_user_id: args.tenantUserId,
    related_entity_type: 'vacate_notice',
    related_entity_id: args.noticeId,
    message_text: args.message,
    message_type: 'in_app',
    read: false,
    organization_id: args.organizationId,
  })
  if (error) {
    throw new Error(error.message)
  }
}
