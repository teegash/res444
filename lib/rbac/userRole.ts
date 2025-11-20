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

    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(
        `
        id,
        role,
        organization_id,
        joined_at,
        organizations (
          id,
          name
        )
      `
      )
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('Error fetching user role:', error)
      return null
    }

    if (!memberships || memberships.length === 0) {
      return null
    }

    // If user has multiple memberships, return the one with highest privileges
    // Priority: admin > manager > caretaker > tenant
    const rolePriority: Record<UserRole, number> = {
      admin: 4,
      manager: 3,
      caretaker: 2,
      tenant: 1,
    }

    const sortedMemberships = memberships.sort((a, b) => {
      const priorityA = rolePriority[a.role as UserRole] || 0
      const priorityB = rolePriority[b.role as UserRole] || 0
      return priorityB - priorityA // Higher priority first
    })

    const primaryMembership = sortedMemberships[0]
    const organization = primaryMembership.organizations as
      | { id: string; name: string }
      | null

    return {
      role: primaryMembership.role as UserRole,
      organization_id: primaryMembership.organization_id,
      organization_name: organization?.name || null,
      membership_id: primaryMembership.id,
      joined_at: primaryMembership.joined_at,
    }
  } catch (error) {
    console.error('Error in getUserRole:', error)
    return null
  }
}

/**
 * Get all user's roles and memberships
 */
export async function getUserRoles(
  userId: string
): Promise<UserRoleData[]> {
  try {
    const supabase = createAdminClient()

    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(
        `
        id,
        role,
        organization_id,
        joined_at,
        organizations (
          id,
          name
        )
      `
      )
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('Error fetching user roles:', error)
      return []
    }

    if (!memberships || memberships.length === 0) {
      return []
    }

    return memberships.map((membership) => {
      const organization = membership.organizations as
        | { id: string; name: string }
        | null

      return {
        role: membership.role as UserRole,
        organization_id: membership.organization_id,
        organization_name: organization?.name || null,
        membership_id: membership.id,
        joined_at: membership.joined_at,
      }
    })
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
  try {
    const supabase = await createClient()

    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single()

    if (error || !membership) {
      return null
    }

    return membership.role as UserRole
  } catch (error) {
    console.error('Error in getUserRoleForOrganization:', error)
    return null
  }
}
