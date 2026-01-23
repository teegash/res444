'use client'

import { BottomNav } from './bottom-nav'
import { useTenantNavItems } from '@/components/navigation/use-tenant-nav-items'

export function TenantMobileNav() {
  const { bottomItems, activeKey } = useTenantNavItems()

  return (
    <div className="md:hidden">
      <BottomNav items={bottomItems} activeKey={activeKey} ariaLabel="Tenant navigation" />
    </div>
  )
}
