'use server'

import { redirect } from 'next/navigation'
import { getUserRole } from './userRole'
import { roleCanAccessRoute, UserRole } from './roles'

/**
 * Check if user can access a route and redirect if not
 */
export async function requireRole(
  userId: string,
  allowedRoles: UserRole[]
): Promise<UserRole> {
  const userRoleData = await getUserRole(userId)

  if (!userRoleData) {
    redirect('/auth/login?error=Please sign in to continue')
  }

  if (!allowedRoles.includes(userRoleData.role)) {
    redirect('/unauthorized')
  }

  return userRoleData.role
}

/**
 * Check if user can access a route
 */
export async function canAccessRoute(
  userId: string,
  route: string
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)

  if (!userRoleData) {
    return false
  }

  return roleCanAccessRoute(userRoleData.role, route)
}

/**
 * Require specific permission
 */
export async function requirePermission(
  userId: string,
  permission: string
): Promise<void> {
  const { hasPermission } = await import('./permissions')
  const canAccess = await hasPermission(userId, permission as any)

  if (!canAccess) {
    redirect('/unauthorized')
  }
}

/**
 * Require any of the specified permissions
 */
export async function requireAnyPermission(
  userId: string,
  permissions: string[]
): Promise<void> {
  const { hasAnyPermission } = await import('./permissions')
  const canAccess = await hasAnyPermission(userId, permissions as any[])

  if (!canAccess) {
    redirect('/unauthorized')
  }
}

/**
 * Get user role or redirect to login
 */
export async function requireAuth(): Promise<{ userId: string; role: UserRole }> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?error=Please sign in to continue')
  }

  const userRoleData = await getUserRole(user.id)

  if (!userRoleData) {
    redirect('/auth/login?error=User role not found. Please contact support.')
  }

  return {
    userId: user.id,
    role: userRoleData.role,
  }
}

