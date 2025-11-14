# RBAC (Role-Based Access Control) System

Complete 4-tier role-based access control system for RentalKenya property management platform.

## Roles

### 1. Admin
- **Access**: All data, all organizations, all buildings, all tenants
- **Permissions**: Create/edit/delete organizations, manage staff, view all reports
- **Dashboard**: Complete admin dashboard
- **Routes**: All dashboard routes

### 2. Manager
- **Access**: Organization buildings, units, tenants
- **Permissions**: Manage tenants, process payments, view organization reports
- **Dashboard**: Filtered org-level view
- **Routes**: Manager-specific dashboard routes

### 3. Caretaker
- **Access**: Assigned building, units, tenants in building
- **Permissions**: Update maintenance, add water bills, view communications
- **Dashboard**: Simplified building view
- **Routes**: Caretaker-specific routes

### 4. Tenant
- **Access**: Own unit, own payments, own requests
- **Permissions**: View lease, make payments, submit maintenance
- **Dashboard**: Personal view only
- **Routes**: Tenant-specific routes

## File Structure

```
lib/rbac/
├── roles.ts          # Role definitions and permissions
├── userRole.ts       # Server-side role fetching utilities
├── permissions.ts    # Permission checking functions
├── routeGuards.ts    # Route protection utilities
├── useRole.ts        # Client-side React hooks
└── README.md         # This file
```

## Usage

### Server-Side (Server Components & API Routes)

#### Check User Role
```typescript
import { getUserRole } from '@/lib/rbac/userRole'

const userRole = await getUserRole(userId)
if (userRole?.role === 'admin') {
  // Admin-only logic
}
```

#### Check Permissions
```typescript
import { hasPermission } from '@/lib/rbac/permissions'

const canCreate = await hasPermission(userId, 'property:create')
if (canCreate) {
  // Allow property creation
}
```

#### Require Role in Page
```typescript
import { requireRole } from '@/lib/rbac/routeGuards'

export default async function AdminPage() {
  const { userId } = await requireAuth()
  await requireRole(userId, ['admin'])
  
  // Page content
}
```

#### Require Permission
```typescript
import { requirePermission } from '@/lib/rbac/routeGuards'

export default async function CreatePropertyPage() {
  const { userId } = await requireAuth()
  await requirePermission(userId, 'property:create')
  
  // Page content
}
```

### Client-Side (React Components)

#### Get User Role
```typescript
'use client'
import { useRole } from '@/lib/rbac/useRole'

export function MyComponent() {
  const { role, organizationName, loading } = useRole()
  
  if (loading) return <div>Loading...</div>
  if (role === 'admin') {
    return <AdminContent />
  }
  return <RegularContent />
}
```

#### Check Specific Role
```typescript
'use client'
import { useHasRole } from '@/lib/rbac/useRole'

export function AdminOnlyButton() {
  const { hasRole, loading } = useHasRole('admin')
  
  if (loading || !hasRole) return null
  return <button>Admin Action</button>
}
```

## Middleware Protection

The middleware automatically protects routes based on roles:

- **Admin**: Can access all `/dashboard/*` routes
- **Manager**: Can access manager routes only
- **Caretaker**: Can access caretaker routes only
- **Tenant**: Can access tenant routes only

Unauthorized access attempts redirect to `/unauthorized` page.

## Permission System

### Permission Format
Permissions follow the pattern: `resource:action`

Examples:
- `property:create` - Create properties
- `tenant:view_all` - View all tenants
- `payment:verify` - Verify payments
- `reports:export` - Export reports

### Checking Permissions

```typescript
// Single permission
const canEdit = await hasPermission(userId, 'property:edit')

// Any permission
const canView = await hasAnyPermission(userId, [
  'property:view_all',
  'property:view_own'
])

// All permissions
const canManage = await hasAllPermissions(userId, [
  'property:edit',
  'property:delete'
])
```

## Route Protection

### Automatic (via Middleware)
Routes are automatically protected based on role definitions in `roles.ts`.

### Manual (in Pages)
```typescript
import { requireAuth, requireRole } from '@/lib/rbac/routeGuards'

export default async function ProtectedPage() {
  const { userId, role } = await requireAuth()
  await requireRole(userId, ['admin', 'manager'])
  
  // Page content
}
```

## Unauthorized Access

When a user tries to access a route they don't have permission for:

1. Middleware redirects to `/unauthorized`
2. Page shows appropriate error message
3. User can navigate back or go to dashboard

## Database Integration

Roles are stored in `organization_members` table:
- `user_id` - References auth.users
- `organization_id` - References organizations
- `role` - One of: 'admin', 'manager', 'caretaker', 'tenant'

The system automatically:
- Fetches user's role from database
- Handles multiple memberships (returns highest privilege)
- Caches role for performance

## Best Practices

1. **Always check permissions server-side** - Client-side checks are for UX only
2. **Use route guards** - Protect pages at the route level
3. **Check permissions in API routes** - Don't trust client-side checks
4. **Use TypeScript** - All types are properly defined
5. **Handle loading states** - Role fetching is async

## Examples

### Example 1: Admin-Only API Route
```typescript
// app/api/admin/users/route.ts
import { requireAuth } from '@/lib/rbac/routeGuards'
import { isAdmin } from '@/lib/rbac/permissions'

export async function GET() {
  const { userId } = await requireAuth()
  
  if (!(await isAdmin(userId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // Admin-only logic
}
```

### Example 2: Conditional UI Rendering
```typescript
'use client'
import { useRole } from '@/lib/rbac/useRole'

export function PropertyActions() {
  const { role, loading } = useRole()
  
  if (loading) return <Skeleton />
  
  return (
    <div>
      {role === 'admin' && <DeleteButton />}
      {['admin', 'manager'].includes(role || '') && <EditButton />}
      <ViewButton />
    </div>
  )
}
```

### Example 3: Protected Page Component
```typescript
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'

export default async function CreatePropertyPage() {
  const { userId } = await requireAuth()
  
  const canCreate = await hasPermission(userId, 'property:create')
  if (!canCreate) {
    redirect('/unauthorized')
  }
  
  return <CreatePropertyForm />
}
```

## Troubleshooting

### User has no role
- Check `organization_members` table
- Ensure user is registered with a role
- Check registration flow

### Permission denied errors
- Verify role has the required permission in `roles.ts`
- Check middleware is running
- Verify database connection

### Route access issues
- Check route is in `ROLE_ROUTES` for user's role
- Verify middleware configuration
- Check for typos in route paths

## Security Notes

1. **Never trust client-side checks** - Always verify server-side
2. **RLS policies** - Database RLS policies provide additional security
3. **Middleware runs first** - Routes are protected before page loads
4. **Role caching** - Consider caching roles for performance
5. **Audit logging** - Log unauthorized access attempts

