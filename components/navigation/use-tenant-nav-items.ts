'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  Bell,
  FileText,
  History,
  Home,
  Lock,
  MessageSquare,
  Receipt,
  Settings,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import type { NavItem } from '@/components/navigation/bottom-nav'

export function useTenantNavItems() {
  const pathname = usePathname()
  const { signOut } = useAuth()

  const menuItems: NavItem[] = useMemo(
    () => [
      { key: 'home', label: 'Home', icon: Home, href: '/dashboard/tenant' },
      { key: 'pay', label: 'Pay Rent', icon: Wallet, href: '/dashboard/tenant/payment?intent=rent' },
      { key: 'payments', label: 'Payments', icon: History, href: '/dashboard/tenant/payments' },
      { key: 'invoices', label: 'Invoices', icon: FileText, href: '/dashboard/tenant/invoices' },
      { key: 'lease', label: 'Lease', icon: FileText, href: '/dashboard/tenant/lease' },
      { key: 'maintenance', label: 'Maintenance', icon: Wrench, href: '/dashboard/tenant/maintenance' },
      { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/tenant/messages' },
      { key: 'statement', label: 'Statement', icon: Receipt, href: '/dashboard/tenant/statement' },
      { key: 'notices', label: 'Notices', icon: Bell, href: '/dashboard/tenant/notices' },
      { key: 'transition', label: 'Transition', icon: ArrowLeftRight, href: '/dashboard/tenant/transition' },
      { key: 'legal', label: 'Legal', icon: Lock, href: '/dashboard/tenant/legal/consent' },
      { key: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/tenant/settings' },
      { key: 'logout', label: 'Logout', icon: LogOut, onClick: () => signOut() },
    ],
    [signOut]
  )

  const bottomItems: NavItem[] = useMemo(
    () => [
      { key: 'home', label: 'Home', icon: Home, href: '/dashboard/tenant' },
      { key: 'maintenance', label: 'Fix', icon: Wrench, href: '/dashboard/tenant/maintenance' },
      { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/tenant/messages' },
      { key: 'lease', label: 'Lease', icon: FileText, href: '/dashboard/tenant/lease' },
      { key: 'payments', label: 'Payments', icon: Wallet, href: '/dashboard/tenant/payments' },
      { key: 'invoices', label: 'Invoices', icon: Receipt, href: '/dashboard/tenant/invoices' },
    ],
    []
  )

  const quickActionItems: NavItem[] = useMemo(
    () => [
      { key: 'pay', label: 'Pay Rent', icon: Wallet, href: '/dashboard/tenant/payment?intent=rent' },
      { key: 'payments', label: 'Payments', icon: History, href: '/dashboard/tenant/payments' },
      { key: 'invoices', label: 'Invoices', icon: FileText, href: '/dashboard/tenant/invoices' },
      { key: 'maintenance', label: 'Maintenance', icon: Wrench, href: '/dashboard/tenant/maintenance' },
      { key: 'messages', label: 'Messages', icon: MessageSquare, href: '/dashboard/tenant/messages' },
      { key: 'lease', label: 'Lease', icon: FileText, href: '/dashboard/tenant/lease' },
    ],
    []
  )

  const activeKey = useMemo(() => {
    if (!pathname) return 'home'
    if (pathname.startsWith('/dashboard/tenant/payments')) return 'payments'
    if (pathname.startsWith('/dashboard/tenant/payment')) return 'pay'
    if (pathname.startsWith('/dashboard/tenant/maintenance')) return 'maintenance'
    if (pathname.startsWith('/dashboard/tenant/messages')) return 'messages'
    if (pathname.startsWith('/dashboard/tenant/invoices')) return 'invoices'
    if (pathname.startsWith('/dashboard/tenant/lease')) return 'lease'
    if (pathname.startsWith('/dashboard/tenant/notices')) return 'notices'
    if (pathname.startsWith('/dashboard/tenant/statement')) return 'statement'
    if (pathname.startsWith('/dashboard/tenant/statements')) return 'statement'
    if (pathname.startsWith('/dashboard/tenant/transition')) return 'transition'
    if (pathname.startsWith('/dashboard/tenant/legal')) return 'legal'
    if (pathname.startsWith('/dashboard/tenant/settings')) return 'settings'
    return 'home'
  }, [pathname])

  return { activeKey, bottomItems, menuItems, quickActionItems }
}
