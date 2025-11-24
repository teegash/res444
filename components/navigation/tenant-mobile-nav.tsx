'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav, NavItem } from './bottom-nav'
import { MoreMenu } from './more-menu'
import { Home, Wallet, Wrench, MessageSquare, FileText, Settings } from 'lucide-react'

export function TenantMobileNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const items: NavItem[] = useMemo(
    () => [
      { key: 'home', label: 'Home', icon: Home, href: '/dashboard/tenant' },
      { key: 'payments', label: 'Pay', icon: Wallet, href: '/dashboard/tenant/payments' },
      { key: 'maintenance', label: 'Fix', icon: Wrench, href: '/dashboard/tenant/maintenance' },
      { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/tenant/messages' },
      { key: 'more', label: 'More', icon: Settings, onClick: () => setMoreOpen(true) },
    ],
    []
  )

  const moreItems: NavItem[] = [
    { key: 'lease', label: 'Lease', icon: FileText, href: '/dashboard/tenant/lease' },
    { key: 'profile', label: 'Profile', icon: Settings, href: '/dashboard/tenant/settings' },
  ]

  const activeKey = useMemo(() => {
    if (!pathname) return 'home'
    if (pathname.startsWith('/dashboard/tenant/payments')) return 'payments'
    if (pathname.startsWith('/dashboard/tenant/maintenance')) return 'maintenance'
    if (pathname.startsWith('/dashboard/tenant/messages')) return 'messages'
    return 'home'
  }, [pathname])

  return (
    <div className="md:hidden">
      <BottomNav
        items={items}
        activeKey={activeKey}
        ariaLabel="Tenant navigation"
        onSelect={(key) => {
          if (key === 'more') setMoreOpen(true)
        }}
      />
      <MoreMenu items={moreItems} open={moreOpen} onOpenChange={setMoreOpen} trigger={<span />} />
    </div>
  )
}
