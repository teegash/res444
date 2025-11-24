'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { ManagerMobileNav } from '@/components/navigation/manager-mobile-nav'
import { TenantMobileNav } from '@/components/navigation/tenant-mobile-nav'
import { useAuth } from '@/lib/auth/context'

export function MobileNavRoot() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null

  const variant: 'manager' | 'tenant' | null = useMemo(() => {
    if (role === 'tenant') return 'tenant'
    if (role) return 'manager'
    if (pathname?.startsWith('/dashboard/tenant')) return 'tenant'
    if (pathname?.startsWith('/dashboard')) return 'manager'
    return null
  }, [pathname, role])

  useEffect(() => {
    if (!user) {
      if (pathname?.startsWith('/dashboard')) {
        router.replace('/auth/signin')
      }
      return
    }
    if (role === 'tenant' && pathname && pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tenant')) {
      router.replace('/dashboard/tenant')
    }
    if (role !== 'tenant' && pathname && pathname.startsWith('/dashboard/tenant')) {
      router.replace('/dashboard')
    }
  }, [pathname, role, router, user])

  if (!variant) return null

  return variant === 'tenant' ? <TenantMobileNav /> : <ManagerMobileNav />
}
