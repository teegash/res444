'use client'

import React, { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Wallet, Wrench, MessageSquare, LayoutDashboard, Building2, Users, FileBarChart, CreditCard, MoreHorizontal, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'

type Variant = 'manager' | 'tenant'
type NavItem = { key: string; label: string; icon: React.ReactNode; href?: string; onClick?: () => void; badge?: number | boolean }

const managerNav: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: <LayoutDashboard className="h-5 w-5" />, href: '/dashboard' },
  { key: 'properties', label: 'Props', icon: <Building2 className="h-5 w-5" />, href: '/dashboard/properties' },
  { key: 'tenants', label: 'Tenants', icon: <Users className="h-5 w-5" />, href: '/dashboard/tenants' },
  { key: 'reports', label: 'Reports', icon: <FileBarChart className="h-5 w-5" />, href: '/dashboard/manager/reports' },
  { key: 'payments', label: 'Pay', icon: <CreditCard className="h-5 w-5" />, href: '/dashboard/payments' },
  { key: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/dashboard/status' },
]

const tenantNav: NavItem[] = [
  { key: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/dashboard/tenant' },
  { key: 'payments', label: 'Pay', icon: <Wallet className="h-5 w-5" />, href: '/dashboard/tenant/payments' },
  { key: 'maintenance', label: 'Fix', icon: <Wrench className="h-5 w-5" />, href: '/dashboard/tenant/maintenance' },
  { key: 'messages', label: 'Msgs', icon: <MessageSquare className="h-5 w-5" />, href: '/dashboard/tenant/messages' },
  { key: 'logout', label: 'Logout', icon: <LogOut className="h-5 w-5" /> },
]

const badgeValue = (badge?: number | boolean) => {
  if (badge === true) return '•'
  if (typeof badge === 'number' && badge > 0) return badge > 99 ? '99+' : String(badge)
  return null
}

export const MobileBottomNav = ({ variant = 'tenant' }: { variant?: Variant }) => {
  const router = useRouter()
  const pathname = usePathname()
  const { signOut } = useAuth()
  const items = variant === 'manager' ? managerNav : tenantNav

  const activeKey = useMemo(() => {
    const match = items.find((i) => i.href && pathname?.startsWith(i.href))
    return match?.key ?? items[0].key
  }, [items, pathname])

  return (
    <nav className="mobile-bottom-nav mobile-only" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = item.key === activeKey
        const badge = badgeValue(item.badge)
        return (
          <button
            key={item.key}
            className={`mobile-nav-item ${active ? 'active' : ''}`}
            onClick={() => {
              if (item.onClick) return item.onClick()
              if (item.key === 'logout') return signOut()
              if (item.href) router.push(item.href)
            }}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
          >
            <div className="mobile-nav-item-icon">{item.icon}</div>
            <span className="mobile-nav-item-label">{item.label}</span>
            {badge && <span className="mobile-nav-badge">{badge}</span>}
          </button>
        )
      })}
    </nav>
  )
}
