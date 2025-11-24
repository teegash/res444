'use client'

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { ManagerMobileNav } from '@/components/navigation/manager-mobile-nav'
import { TenantMobileNav } from '@/components/navigation/tenant-mobile-nav'

export function MobileNavRoot() {
  const pathname = usePathname()

  const variant: 'manager' | 'tenant' | null = useMemo(() => {
    if (!pathname) return null
    if (pathname.startsWith('/dashboard/tenant')) return 'tenant'
    if (pathname.startsWith('/dashboard')) return 'manager'
    return null
  }, [pathname])

  if (!variant) return null

  return variant === 'tenant' ? <TenantMobileNav /> : <ManagerMobileNav />
}
