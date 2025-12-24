import { supabaseAdmin } from '@/lib/storageAdmin'

export async function requireOrgRole(userId: string, organizationId: string, allowedRoles: string[]) {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const role = (data as any)?.role as string | null | undefined
  if (!role || !allowedRoles.includes(role)) throw new Error('Forbidden')
  return role
}

