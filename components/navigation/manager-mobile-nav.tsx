'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BottomNav, NavItem } from './bottom-nav'
import { MoreMenu } from './more-menu'
import {
  LayoutDashboard,
  Building2,
  Users,
  FileBarChart,
  CreditCard,
  Wrench,
  Bell,
  MessageSquare,
} from 'lucide-react'

export function ManagerMobileNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const items: NavItem[] = useMemo(
    () => [
      { key: 'dashboard', label: 'Home', icon: LayoutDashboard, href: '/dashboard' },
      { key: 'properties', label: 'Props', icon: Building2, href: '/dashboard/properties' },
      { key: 'tenants', label: 'Tenants', icon: Users, href: '/dashboard/tenants' },
      { key: 'reports', label: 'Reports', icon: FileBarChart, href: '/dashboard/manager/reports' },
      { key: 'payments', label: 'Pay', icon: CreditCard, href: '/dashboard/payments' },
      {
        key: 'more',
        label: 'More',
        icon: MessageSquare,
        onClick: () => setMoreOpen(true),
      },
    ],
    []
  )

  const moreItems: NavItem[] = [
    { key: 'maintenance', label: 'Maintenance', icon: Wrench, href: '/dashboard/maintenance' },
    { key: 'notices', label: 'Notices', icon: Bell, href: '/dashboard/manager/notices' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/communications' },
  ]

  const activeKey = useMemo(() => {
    if (!pathname) return 'dashboard'
    if (pathname.startsWith('/dashboard/properties')) return 'properties'
    if (pathname.startsWith('/dashboard/tenants')) return 'tenants'
    if (pathname.includes('/reports')) return 'reports'
    if (pathname.includes('/payments')) return 'payments'
    return 'dashboard'
  }, [pathname])

  return (
    <div className="md:hidden">
      <BottomNav
        items={items}
        activeKey={activeKey}
        ariaLabel="Manager navigation"
        onSelect={(key) => {
          if (key === 'more') {
            setMoreOpen(true)
          }
        }}
      />
      <MoreMenu
        items={moreItems}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        trigger={<span />}
      />
    </div>
  )
}
