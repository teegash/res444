import { supabaseAdmin } from '@/lib/storageAdmin'

export async function requireOrgRole(userId: string, organizationId: string, allowedRoles: string[]) {
  const admin = supabaseAdmin()

  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (membershipError) throw new Error(membershipError.message)

  const membershipRole = membership?.role ? String(membership.role) : null
  if (membershipRole && allowedRoles.includes(membershipRole)) return membershipRole
  if (membershipRole && !allowedRoles.includes(membershipRole)) throw new Error('Forbidden')

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)

  const profileRole = profile?.role ? String(profile.role) : null
  if (!profileRole || !allowedRoles.includes(profileRole)) throw new Error('Forbidden')
  return profileRole
}

