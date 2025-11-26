'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { ManagerMobileNav } from '@/components/navigation/manager-mobile-nav'
import { TenantMobileNav } from '@/components/navigation/tenant-mobile-nav'
import { useAuth } from '@/lib/auth/context'

export function MobileNavRoot() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()

  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
  const isDashboardPath = pathname?.startsWith('/dashboard') ?? false
  const isAuthenticated = !!user && !loading

  const variant: 'manager' | 'tenant' | null = useMemo(() => {
    if (!isAuthenticated || !isDashboardPath) return null
    if (role === 'tenant') return 'tenant'
    if (role) return 'manager'
    if (pathname?.startsWith('/dashboard/tenant')) return 'tenant'
    if (pathname?.startsWith('/dashboard')) return 'manager'
    return null
  }, [isAuthenticated, isDashboardPath, pathname, role])

  useEffect(() => {
    if (loading) return

    if (!user && isDashboardPath) {
      router.replace('/auth/login')
      return
    }
    if (role === 'tenant' && pathname && pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tenant')) {
      router.replace('/dashboard/tenant')
    }
    if (role !== 'tenant' && pathname && pathname.startsWith('/dashboard/tenant')) {
      router.replace('/dashboard')
    }
  }, [isDashboardPath, loading, pathname, role, router, user])

  if (loading || !variant) return null

  const spacerStyle = {
    height: '88px',
    paddingBottom: 'env(safe-area-inset-bottom)',
  }

  return (
    <>
      <div aria-hidden="true" className="md:hidden" style={spacerStyle} />
      {variant === 'tenant' ? <TenantMobileNav /> : <ManagerMobileNav />}
    </>
  )
}
