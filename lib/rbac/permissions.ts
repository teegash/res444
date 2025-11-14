'use server'

import { UserRole, Permission, roleHasPermission } from './roles'
import { getUserRole } from './userRole'

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permission: Permission
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return false
  }

  return roleHasPermission(userRoleData.role, permission)
}

/**
 * Check if a user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissions: Permission[]
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return false
  }

  return permissions.some((permission) =>
    roleHasPermission(userRoleData.role, permission)
  )
}

/**
 * Check if a user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissions: Permission[]
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return false
  }

  return permissions.every((permission) =>
    roleHasPermission(userRoleData.role, permission)
  )
}

/**
 * Check if user can access a resource based on ownership
 * For resources that have ownership checks (view_own permissions)
 */
export async function canAccessResource(
  userId: string,
  permission: Permission,
  resourceOwnerId?: string | null,
  organizationId?: string | null
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return false
  }

  // Admin can access everything
  if (userRoleData.role === 'admin') {
    return true
  }

  // Check if user has the permission
  if (!roleHasPermission(userRoleData.role, permission)) {
    return false
  }

  // For view_all permissions, user can access regardless of ownership
  if (permission.includes(':view_all')) {
    return true
  }

  // For view_own permissions, check ownership
  if (permission.includes(':view_own')) {
    // If resource belongs to user
    if (resourceOwnerId && resourceOwnerId === userId) {
      return true
    }

    // Manager and caretaker can view resources in their organization
    if (
      (userRoleData.role === 'manager' || userRoleData.role === 'caretaker') &&
      organizationId &&
      organizationId === userRoleData.organization_id
    ) {
      return true
    }

    return false
  }

  // For other permissions, check role-based access
  return roleHasPermission(userRoleData.role, permission)
}

/**
 * Check if user can perform an action on a resource
 */
export async function canPerformAction(
  userId: string,
  action: Permission,
  resourceData?: {
    ownerId?: string | null
    organizationId?: string | null
    buildingId?: string | null
  }
): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return false
  }

  // Admin can do everything
  if (userRoleData.role === 'admin') {
    return true
  }

  // Check if role has the permission
  if (!roleHasPermission(userRoleData.role, action)) {
    return false
  }

  // For create actions, check if user has create permission
  if (action.includes(':create')) {
    return true
  }

  // For edit/delete actions, check ownership or organization
  if (action.includes(':edit') || action.includes(':delete')) {
    // If resource has owner, check if user is owner
    if (resourceData?.ownerId && resourceData.ownerId === userId) {
      return true
    }

    // Manager can edit/delete resources in their organization
    if (
      userRoleData.role === 'manager' &&
      resourceData?.organizationId &&
      resourceData.organizationId === userRoleData.organization_id
    ) {
      return true
    }

    // Caretaker can edit/delete resources in their assigned building
    if (
      userRoleData.role === 'caretaker' &&
      resourceData?.buildingId
    ) {
      // Would need to check if caretaker is assigned to this building
      // For now, return true if they have the permission
      return true
    }
  }

  return true
}

/**
 * Get user's effective permissions
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) {
    return []
  }

  const { getRolePermissions } = await import('./roles')
  return getRolePermissions(userRoleData.role)
}

/**
 * Check if user is admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  return userRoleData?.role === 'admin'
}

/**
 * Check if user is manager or higher
 */
export async function isManagerOrHigher(userId: string): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) return false

  return ['admin', 'manager'].includes(userRoleData.role)
}

/**
 * Check if user is staff (admin, manager, or caretaker)
 */
export async function isStaff(userId: string): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  if (!userRoleData) return false

  return ['admin', 'manager', 'caretaker'].includes(userRoleData.role)
}

/**
 * Check if user is tenant
 */
export async function isTenant(userId: string): Promise<boolean> {
  const userRoleData = await getUserRole(userId)
  return userRoleData?.role === 'tenant'
}

