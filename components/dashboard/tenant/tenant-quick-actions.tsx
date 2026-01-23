'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TenantNavGrid } from '@/components/navigation/tenant-nav-grid'
import { useTenantNavItems } from '@/components/navigation/use-tenant-nav-items'

export function TenantQuickActions() {
  const { quickActionItems, activeKey } = useTenantNavItems()

  return (
    <Card className="bg-gradient-to-br from-orange-50/50 to-yellow-50/30 border-orange-100">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
        <p className="text-sm text-muted-foreground mb-4">Access your most-used features</p>

        <TenantNavGrid
          items={quickActionItems}
          activeKey={activeKey}
          columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        />
      </CardContent>
    </Card>
  )
}
