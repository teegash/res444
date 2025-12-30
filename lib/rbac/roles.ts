/**
 * Role-Based Access Control (RBAC) System
 * Defines 4-tier role system: Admin, Manager, Caretaker, Tenant
 */

export type UserRole = 'admin' | 'manager' | 'caretaker' | 'tenant'

export type Permission =
  // Organization Management
  | 'org:create'
  | 'org:edit'
  | 'org:delete'
  | 'org:view_all'
  | 'org:view_own'
  // Staff Management
  | 'staff:manage'
  | 'staff:view'
  // Property Management
  | 'property:create'
  | 'property:edit'
  | 'property:delete'
  | 'property:view_all'
  | 'property:view_own'
  // Unit Management
  | 'unit:create'
  | 'unit:edit'
  | 'unit:delete'
  | 'unit:view_all'
  | 'unit:view_own'
  // Tenant Management
  | 'tenant:create'
  | 'tenant:edit'
  | 'tenant:delete'
  | 'tenant:view_all'
  | 'tenant:view_own'
  // Lease Management
  | 'lease:create'
  | 'lease:edit'
  | 'lease:delete'
  | 'lease:view_all'
  | 'lease:view_own'
  // Payment Management
  | 'payment:process'
  | 'payment:verify'
  | 'payment:reject'
  | 'payment:view_all'
  | 'payment:view_own'
  // Invoice Management
  | 'invoice:create'
  | 'invoice:edit'
  | 'invoice:delete'
  | 'invoice:view_all'
  | 'invoice:view_own'
  // Maintenance Management
  | 'maintenance:create'
  | 'maintenance:update'
  | 'maintenance:assign'
  | 'maintenance:view_all'
  | 'maintenance:view_own'
  // Water Bill Management
  | 'water:add'
  | 'water:edit'
  | 'water:view_all'
  | 'water:view_own'
  // Reports
  | 'reports:view_all'
  | 'reports:view_own'
  | 'reports:export'
  // Communications
  | 'communications:send'
  | 'communications:view_all'
  | 'communications:view_own'
  // Settings
  | 'settings:manage'
  | 'settings:view'

/**
 * Role definitions with permissions
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    // Full access to everything
    'org:create',
    'org:edit',
    'org:delete',
    'org:view_all',
    'staff:manage',
    'staff:view',
    'property:create',
    'property:edit',
    'property:delete',
    'property:view_all',
    'unit:create',
    'unit:edit',
    'unit:delete',
    'unit:view_all',
    'tenant:create',
    'tenant:edit',
    'tenant:delete',
    'tenant:view_all',
    'lease:create',
    'lease:edit',
    'lease:delete',
    'lease:view_all',
    'payment:process',
    'payment:verify',
    'payment:reject',
    'payment:view_all',
    'invoice:create',
    'invoice:edit',
    'invoice:delete',
    'invoice:view_all',
    'maintenance:create',
    'maintenance:update',
    'maintenance:assign',
    'maintenance:view_all',
    'water:add',
    'water:edit',
    'water:view_all',
    'reports:view_all',
    'reports:export',
    'communications:send',
    'communications:view_all',
    'settings:manage',
    'settings:view',
  ],

  manager: [
    // Organization-level access
    'org:view_own',
    'staff:view',
    'property:create',
    'property:edit',
    'property:view_own',
    'unit:create',
    'unit:edit',
    'unit:view_all',
    'tenant:create',
    'tenant:edit',
    'tenant:view_all',
    'lease:create',
    'lease:edit',
    'lease:view_all',
    'payment:process',
    'payment:verify',
    'payment:reject',
    'payment:view_all',
    'invoice:create',
    'invoice:edit',
    'invoice:view_all',
    'maintenance:create',
    'maintenance:update',
    'maintenance:assign',
    'maintenance:view_all',
    'water:add',
    'water:edit',
    'water:view_all',
    'reports:view_own',
    'reports:export',
    'communications:send',
    'communications:view_all',
    'settings:view',
  ],

  caretaker: [
    // Building-level access
    'property:view_own',
    'unit:view_own',
    'tenant:view_own',
    'lease:view_own',
    'payment:view_own',
    'invoice:view_own',
    'maintenance:update',
    'maintenance:view_own',
    'water:add',
    'water:view_own',
    'communications:send',
    'communications:view_own',
  ],

  tenant: [
    // Own data only
    'property:view_own',
    'unit:view_own',
    'lease:view_own',
    'payment:view_own',
    'invoice:view_own',
    'maintenance:create',
    'maintenance:view_own',
    'water:view_own',
    'communications:send',
    'communications:view_own',
  ],
}

/**
 * Route access definitions by role
 */
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: [
    '/dashboard',
    '/dashboard/water-bills/bulk',
    '/dashboard/properties',
    '/dashboard/tenants',
    '/dashboard/finances',
    '/dashboard/payments',
    '/dashboard/communications',
    '/dashboard/maintenance',
    '/dashboard/reports',
    '/dashboard/settings',
    '/dashboard/setup',
    '/dashboard/manager',
  ],

  manager: [
    '/dashboard',
    '/dashboard/water-bills/bulk',
    '/dashboard/properties',
    '/dashboard/tenants',
    '/dashboard/finances',
    '/dashboard/payments',
    '/dashboard/communications',
    '/dashboard/maintenance',
    '/dashboard/reports',
    '/dashboard/settings',
    '/dashboard/manager',
  ],

  caretaker: [
    '/dashboard',
    '/dashboard/maintenance',
    '/dashboard/communications',
    '/dashboard/water-bills',
  ],

  tenant: [
    '/dashboard/tenant',
    '/dashboard/tenant/payment',
    '/dashboard/tenant/maintenance',
    '/dashboard/tenant/messages',
    '/dashboard/tenant/notices',
    '/dashboard/tenant/lease',
    '/dashboard/tenant/payments',
    '/dashboard/tenant/receipts',
    '/dashboard/tenant/statements',
  ],
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = getRolePermissions(role)
  return permissions.includes(permission)
}

/**
 * Get allowed routes for a role
 */
export function getRoleRoutes(role: UserRole): string[] {
  return ROLE_ROUTES[role] || []
}

/**
 * Check if a role can access a route
 */
export function roleCanAccessRoute(role: UserRole, route: string): boolean {
  const allowedRoutes = getRoleRoutes(role)
  
  // Check exact match
  if (allowedRoutes.includes(route)) {
    return true
  }

  // Check if route starts with any allowed route
  return allowedRoutes.some((allowedRoute) => route.startsWith(allowedRoute))
}

/**
 * Role hierarchy (higher number = more privileges)
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  caretaker: 2,
  tenant: 1,
}

/**
 * Check if role1 has higher or equal privileges than role2
 */
export function hasHigherOrEqualPrivileges(
  role1: UserRole,
  role2: UserRole
): boolean {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2]
}

/**
 * Role display names
 */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  caretaker: 'Caretaker',
  tenant: 'Tenant',
}

/**
 * Role descriptions
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full system access. Can manage all organizations, properties, and users.',
  manager: 'Organization-level access. Can manage properties, tenants, and payments within their organization.',
  caretaker: 'Building-level access. Can manage maintenance, water bills, and communications for assigned buildings.',
  tenant: 'Personal access. Can view own lease, make payments, and submit maintenance requests.',
}
