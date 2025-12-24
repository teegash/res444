import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

export type ManagerContext =
  | { admin: AdminClient; orgId: string; userId: string }
  | { error: NextResponse }

export type TenantContext =
  | { admin: AdminClient; orgId: string; userId: string }
  | { error: NextResponse }

export async function getManagerContext(): Promise<ManagerContext> {
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
    return {
      error: NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      ),
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load organization.' }, { status: 500 }) }
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load profile.' }, { status: 500 }) }
  }

  const orgId = (membership as any)?.organization_id || (profile as any)?.organization_id
  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }) }
  }

  const role = String((membership as any)?.role || (profile as any)?.role || '')
  if (!role || !MANAGER_ROLES.includes(role as any)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, orgId, userId: user.id }
}

async function resolveTenantOrgId(admin: AdminClient, userId: string) {
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if ((membership as any)?.organization_id) {
    return (membership as any).organization_id as string
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  return ((profile as any)?.organization_id as string | null) || null
}

export async function getTenantContext(): Promise<TenantContext> {
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
    return {
      error: NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      ),
    }
  }

  const orgId = await resolveTenantOrgId(admin, user.id)
  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }) }
  }

  return { admin, orgId, userId: user.id }
}

