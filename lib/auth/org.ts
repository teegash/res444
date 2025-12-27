import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type OrgContext = {
  userId: string
  organizationId: string
  role: 'admin' | 'manager' | 'caretaker' | 'tenant'
}

export async function supabaseServer() {
  return createClient()
}

export async function getOrgContext(): Promise<OrgContext> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    throw new Error('Unauthenticated')
  }

  const adminSupabase = createAdminClient()
  if (!adminSupabase) {
    throw new Error('Server configuration error')
  }

  const { data: membership, error: memErr } = await adminSupabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (memErr) {
    throw new Error(memErr.message || 'Failed to load organization membership')
  }

  if (!membership?.organization_id || !membership?.role) {
    throw new Error('No organization membership found')
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    role: String(membership.role).toLowerCase() as OrgContext['role'],
  }
}

export function assertRole(ctx: OrgContext, allowed: Array<OrgContext['role']>) {
  if (!allowed.includes(ctx.role)) {
    throw new Error('Forbidden')
  }
}
