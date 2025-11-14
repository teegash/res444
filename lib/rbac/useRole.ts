'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { UserRole } from './roles'

interface RoleData {
  role: UserRole
  organization_id: string | null
  organization_name: string | null
  membership_id: string
  joined_at: string
}

/**
 * Client-side hook to get user's role
 * Fetches role from API endpoint
 */
export function useRole() {
  const { user, loading: authLoading } = useAuth()
  const [roleData, setRoleData] = useState<RoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user) {
      setRoleData(null)
      setLoading(false)
      return
    }

    // Fetch user role from API
    const fetchRole = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/user/role')
        
        if (!response.ok) {
          throw new Error('Failed to fetch user role')
        }

        const data = await response.json() as RoleData
        setRoleData(data)
        setError(null)
      } catch (err) {
        const error = err as Error
        setError(error.message)
        setRoleData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchRole()
  }, [user, authLoading])

  return {
    role: roleData?.role || null,
    organizationId: roleData?.organization_id || null,
    organizationName: roleData?.organization_name || null,
    loading,
    error,
  }
}

/**
 * Hook to check if user has a specific role
 */
export function useHasRole(requiredRole: UserRole) {
  const { role, loading } = useRole()
  return {
    hasRole: role === requiredRole,
    loading,
  }
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useHasAnyRole(requiredRoles: UserRole[]) {
  const { role, loading } = useRole()
  return {
    hasAnyRole: role ? requiredRoles.includes(role) : false,
    loading,
  }
}

