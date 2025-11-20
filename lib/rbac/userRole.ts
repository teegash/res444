'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { UserRole } from './roles'

export interface UserRoleData {
  role: UserRole
  organization_id: string | null
  organization_name: string | null
  membership_id: string
  joined_at: string
}

// Re-export for client-side use
export type { UserRole }

/**
 * Get user's role from organization_members table
 * Returns the highest privilege role if user has multiple memberships
 */
export async function getUserRole(userId: string): Promise<UserRoleData | null> {
  try {
    const supabase = createAdminClient()
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching user role profile:', error)
      return null
    }

    if (!profile || !profile.role) {
      return null
    }

    return {
      role: profile.role as UserRole,
      organization_id: null,
      organization_name: null,
      membership_id: userId,
      joined_at: profile.created_at || new Date().toISOString(),
    }
  } catch (error) {
    console.error('Error in getUserRole:', error)
    return null
  }
}

/**
 * Get all user's roles and memberships
 */
export async function getUserRoles(userId: string): Promise<UserRoleData[]> {
  try {
    const supabase = createAdminClient()
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (error || !profile || !profile.role) {
      return []
    }

    return [
      {
        role: profile.role as UserRole,
        organization_id: null,
        organization_name: null,
        membership_id: userId,
        joined_at: profile.created_at || new Date().toISOString(),
      },
    ]
  } catch (error) {
    console.error('Error in getUserRoles:', error)
    return []
  }
}

/**
 * Check if user has a specific role
 */
export async function userHasRole(
  userId: string,
  role: UserRole
): Promise<boolean> {
  const userRole = await getUserRole(userId)
  return userRole?.role === role
}

/**
 * Check if user has any of the specified roles
 */
export async function userHasAnyRole(
  userId: string,
  roles: UserRole[]
): Promise<boolean> {
  const userRole = await getUserRole(userId)
  if (!userRole) return false
  return roles.includes(userRole.role)
}

/**
 * Get user's role for a specific organization
 */
export async function getUserRoleForOrganization(
  userId: string,
  organizationId: string
): Promise<UserRole | null> {
  console.warn('getUserRoleForOrganization is not supported in this environment')
  return null
}
