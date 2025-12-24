import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function requireOrgRole(actorUserId: string, organizationId: string, roles: string[]) {
  const admin = supabaseAdmin()

  const { data: member, error: memberError } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (memberError) throw new Error(memberError.message)

  const memberRole = member?.role ? String(member.role) : null
  if (memberRole && roles.includes(memberRole)) return memberRole

  // Tenant users in this codebase are sometimes tracked via user_profiles.role + organization_id
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', actorUserId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)

  const profileRole = profile?.role ? String(profile.role) : null
  if (!profileRole || !roles.includes(profileRole)) throw new Error('Forbidden')
  return profileRole
}

