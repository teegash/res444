import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager'])

async function requireOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 403 }) }
  }

  const role = membership.role || (user.user_metadata as any)?.role
  if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, organizationId: membership.organization_id }
}

export async function GET() {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error

  const { admin, organizationId } = ctx

  const { data, error } = await admin
    .from('reminders')
    .select(
      'id,user_id,reminder_type,stage,delivery_status,scheduled_for,sent_at,last_error,message,created_at,related_entity_id,channel'
    )
    .eq('organization_id', organizationId)
    .eq('channel', 'sms')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const rows = Array.isArray(data) ? data : []
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)))

  let profileMap = new Map<string, { full_name: string | null; phone_number: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .in('id', userIds)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    profileMap = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        { full_name: profile.full_name ?? null, phone_number: profile.phone_number ?? null },
      ])
    )
  }

  const deliveries = rows.map((row) => {
    const profile = profileMap.get(row.user_id) || { full_name: null, phone_number: null }
    return {
      ...row,
      tenant_name: profile.full_name || 'Tenant',
      tenant_phone: profile.phone_number || null,
    }
  })

  return NextResponse.json({ deliveries })
}
