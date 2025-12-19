'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav, NavItem } from './bottom-nav'
import { Home, Wallet, Wrench, MessageSquare, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'

export function TenantMobileNav() {
  const pathname = usePathname()
  const { signOut } = useAuth()

  const items: NavItem[] = useMemo(
    () => [
      { key: 'home', label: 'Home', icon: Home, href: '/dashboard/tenant' },
      { key: 'payments', label: 'Pay', icon: Wallet, href: '/dashboard/tenant/payments' },
      { key: 'maintenance', label: 'Fix', icon: Wrench, href: '/dashboard/tenant/maintenance' },
      { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/tenant/messages' },
      { key: 'logout', label: 'Logout', icon: LogOut, onClick: () => signOut() },
    ],
    [signOut]
  )

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
      />
    </div>
  )
}
