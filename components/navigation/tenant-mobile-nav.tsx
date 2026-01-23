'use client'

import { BottomNavBar } from '@/components/ui/bottom-nav-bar'
import { useTenantNavItems } from '@/components/navigation/use-tenant-nav-items'

export function TenantMobileNav() {
  const { bottomItems, activeKey } = useTenantNavItems()

  return (
    <div className="md:hidden">
      <BottomNavBar items={bottomItems} activeKey={activeKey} stickyBottom />
    </div>
  )
}
