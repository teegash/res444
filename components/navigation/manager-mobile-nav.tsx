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
  Droplet,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/context'

export function ManagerMobileNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
  const isCaretaker = role === 'caretaker'

  const items: NavItem[] = useMemo(() => {
    if (isCaretaker) {
      return [
        { key: 'dashboard', label: 'Home', icon: LayoutDashboard, href: '/dashboard' },
        { key: 'tenants', label: 'Tenants', icon: Users, href: '/dashboard/tenants' },
        { key: 'payments', label: 'Pay', icon: CreditCard, href: '/dashboard/payments' },
        { key: 'water', label: 'Water', icon: Droplet, href: '/dashboard/water-bills' },
        { key: 'messages', label: 'Msgs', icon: MessageSquare, href: '/dashboard/communications' },
        { key: 'maintenance', label: 'Fix', icon: Wrench, href: '/dashboard/maintenance' },
      ]
    }
    return [
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
    ]
  }, [isCaretaker])

  const moreItems: NavItem[] = isCaretaker
    ? []
    : [
        { key: 'maintenance', label: 'Maintenance', icon: Wrench, href: '/dashboard/maintenance' },
        { key: 'notices', label: 'Notices', icon: Bell, href: '/dashboard/manager/notices' },
        { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/communications' },
      ]

  const activeKey = useMemo(() => {
    if (!pathname) return 'dashboard'
    if (pathname.startsWith('/dashboard/properties')) return 'properties'
    if (pathname.startsWith('/dashboard/tenants')) return 'tenants'
    if (pathname.startsWith('/dashboard/communications')) return 'messages'
    if (pathname.startsWith('/dashboard/water-bills')) return 'water'
    if (pathname.startsWith('/dashboard/maintenance')) return 'maintenance'
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
      {moreItems.length > 0 && (
        <MoreMenu
          items={moreItems}
          open={moreOpen}
          onOpenChange={setMoreOpen}
          trigger={<span />}
        />
      )}
    </div>
  )
}
