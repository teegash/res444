import { createClient } from '@/lib/supabase/server'

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

  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (memErr || !membership?.organization_id || !membership?.role) {
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
