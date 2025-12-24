import { supabaseAdmin } from '@/lib/supabaseAdmin'

export function requireActorUserId(req: Request) {
  const actor = req.headers.get('x-actor-user-id')
  if (!actor) throw new Error('Missing x-actor-user-id')
  return actor
}

export async function requireOrgRole(params: {
  actorUserId: string
  organizationId: string
  allowedRoles: string[]
}) {
  const admin = supabaseAdmin()

  const { data, error } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', params.organizationId)
    .eq('user_id', params.actorUserId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const role = data?.role ? String(data.role) : undefined
  if (!role) throw new Error('Forbidden: not a member of organization')
  if (!params.allowedRoles.includes(role)) throw new Error('Forbidden: insufficient role')
  return role
}

