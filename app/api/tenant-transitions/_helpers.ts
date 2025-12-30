import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_LOOSE_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function normalizeUuid(input: string) {
  let decoded = String(input || '').trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // keep raw input if decoding fails
  }
  const strict = decoded.match(UUID_RE)
  if (strict?.[0]) return strict[0]
  const loose = decoded.match(UUID_LOOSE_RE)
  return loose?.[0] || ''
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
  if (!admin) {
    return { error: NextResponse.json({ success: false, error: 'Server misconfigured.' }, { status: 500 }) }
  }

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

export async function logTransitionEvent(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    organization_id: string
    case_id: string
    actor_user_id: string | null
    action: string
    metadata?: any
  }
) {
  const { error } = await admin.from('tenant_transition_events').insert({
    organization_id: args.organization_id,
    case_id: args.case_id,
    actor_user_id: args.actor_user_id,
    action: args.action,
    metadata: args.metadata ?? {},
  })
  if (error) throw new Error(error.message)
}

export async function notifyTenant(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    tenantUserId: string
    organizationId: string
    caseId: string
    message: string
    senderUserId?: string | null
  }
) {
  const { error } = await admin.from('communications').insert({
    sender_user_id: args.senderUserId ?? null,
    recipient_user_id: args.tenantUserId,
    related_entity_type: 'tenant_transition',
    related_entity_id: args.caseId,
    message_text: args.message,
    message_type: 'in_app',
    read: false,
    organization_id: args.organizationId,
  })
  if (error) throw new Error(error.message)
}
