'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, LogOut, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

interface NotificationItem {
  id: string
  sender_user_id: string
  message_text: string
  created_at: string
  read: boolean
  related_entity_type?: string | null
  related_entity_id?: string | null
}

function formatRelative(dateString: string) {
  const date = new Date(dateString)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function formatRoleLabel(role: unknown): string {
  const raw = String(role ?? '').trim().toLowerCase()
  if (!raw) return 'User'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'caretaker') return 'Caretaker'
  if (raw === 'tenant') return 'Tenant'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

type SearchDestination = {
  label: string
  description: string
  href: string
  keywords?: string[]
  category?: string
  priority?: number
}

const SEARCH_DESTINATIONS: SearchDestination[] = [
  {
    label: 'Dashboard',
    description: 'Manager overview and KPIs',
    href: '/dashboard',
    keywords: ['home', 'overview', 'kpi'],
    category: 'Overview',
    priority: 8,
  },
  {
    label: 'Tenants',
    description: 'Manage active tenants and leases',
    href: '/dashboard/tenants',
    keywords: ['tenant', 'lease', 'roster'],
    category: 'People',
    priority: 10,
  },
  {
    label: 'Tenant Archive',
    description: 'Archived tenants and vault access',
    href: '/dashboard/tenants/archive',
    keywords: ['archive', 'vault'],
    category: 'People',
    priority: 6,
  },
  {
    label: 'Properties',
    description: 'Buildings and unit inventory',
    href: '/dashboard/properties',
    keywords: ['property', 'building', 'units'],
    category: 'Portfolio',
    priority: 9,
  },
  {
    label: 'Maintenance',
    description: 'Requests and technician assignments',
    href: '/dashboard/maintenance',
    keywords: ['repairs', 'requests', 'tickets'],
    category: 'Operations',
    priority: 9,
  },
  {
    label: 'Expenses',
    description: 'Operational spending and costs',
    href: '/dashboard/manager/expenses',
    keywords: ['costs', 'bills'],
    category: 'Finance',
    priority: 7,
  },
  {
    label: 'Statements',
    description: 'Tenant statements and balances',
    href: '/dashboard/manager/statements',
    keywords: ['ledger', 'statement'],
    category: 'Finance',
    priority: 7,
  },
  {
    label: 'Arrears',
    description: 'Overdue rent tracking',
    href: '/dashboard/finances/arrears',
    keywords: ['arrears', 'overdue', 'defaulters'],
    category: 'Finance',
    priority: 6,
  },
  {
    label: 'Prepayments',
    description: 'Prepaid rent monitoring',
    href: '/dashboard/finances/prepayments',
    keywords: ['prepaid', 'advance'],
    category: 'Finance',
    priority: 5,
  },
  {
    label: 'Water Bills',
    description: 'Generate and manage water bills',
    href: '/dashboard/water-bills',
    keywords: ['water', 'utilities'],
    category: 'Billing',
    priority: 6,
  },
  {
    label: 'Water Bill Statements',
    description: 'Water bill statement history',
    href: '/dashboard/water-bills/statements',
    keywords: ['water', 'statements'],
    category: 'Billing',
    priority: 5,
  },
  {
    label: 'Communications',
    description: 'Tenant messages and inbox',
    href: '/dashboard/communications',
    keywords: ['messages', 'chat', 'communication'],
    category: 'Engagement',
    priority: 6,
  },
  {
    label: 'Notices',
    description: 'Broadcast notices to tenants',
    href: '/dashboard/manager/notices',
    keywords: ['notice', 'announcement'],
    category: 'Engagement',
    priority: 4,
  },
  {
    label: 'Transitions',
    description: 'Move-out and onboarding workflows',
    href: '/dashboard/manager/transitions',
    keywords: ['transition', 'vacate', 'onboarding'],
    category: 'Operations',
    priority: 4,
  },
  {
    label: 'Reports',
    description: 'Revenue, arrears, and occupancy reports',
    href: '/dashboard/manager/reports',
    keywords: ['reports', 'analytics', 'insights'],
    category: 'Insights',
    priority: 5,
  },
  {
    label: 'Revenue Report',
    description: 'Revenue trends and collections',
    href: '/dashboard/manager/reports/revenue',
    keywords: ['revenue', 'collections'],
    category: 'Insights',
    priority: 4,
  },
  {
    label: 'Occupancy Report',
    description: 'Occupancy and unit status',
    href: '/dashboard/manager/reports/occupancy',
    keywords: ['occupancy', 'units'],
    category: 'Insights',
    priority: 4,
  },
  {
    label: 'Maintenance Report',
    description: 'Maintenance performance metrics',
    href: '/dashboard/manager/reports/maintenance-performance',
    keywords: ['maintenance', 'performance'],
    category: 'Insights',
    priority: 4,
  },
  {
    label: 'Financial Report',
    description: 'Income vs expenses analytics',
    href: '/dashboard/manager/reports/financial',
    keywords: ['financial', 'p&l', 'noi'],
    category: 'Insights',
    priority: 4,
  },
]

export function Header() {
  const { user, signOut } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [userFirstName, setUserFirstName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState(-1)
  const unreadCount = notifications.filter((n) => {
    const type = (n.related_entity_type || '').toLowerCase()
    return type === 'lease_expired' || !n.read
  }).length
  const expiredCount = notifications.filter(
    (n) => (n.related_entity_type || '').toLowerCase() === 'lease_expired'
  ).length
  const router = useRouter()

  // Fetch user's first name from profile
  useEffect(() => {
    const fetchUserFirstName = async () => {
      if (!user?.id) return

      try {
        const response = await fetch(`/api/user/profile?userId=${user.id}`, {
          credentials: 'include',
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data?.full_name) {
            // Extract first name from full_name
            const firstName = result.data.full_name.split(' ')[0]
            setUserFirstName(firstName)
          }
          if (result.success && result.data?.role) {
            setUserRole(result.data.role)
          } else if (result.success && result.data?.role === null) {
            setUserRole(null)
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }

    fetchUserFirstName()
  }, [user])

  const sortNotifications = useCallback((items: NotificationItem[]) => {
    const rank = (item: NotificationItem) => {
      const type = (item.related_entity_type || '').toLowerCase()
      if (type === 'lease_expired') return 0
      if (type === 'vacate_notice') return 1
      if (type === 'tenant_transition') return 2
      if (type === 'payment') return 3
      if (type === 'maintenance_request') return 4
      return 5
    }

    return [...items].sort((a, b) => {
      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return bTime - aTime
    })
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/notifications', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to fetch notifications.')
      }
      const payload = await response.json()
      const visible = (payload.data || []).filter((item: NotificationItem) => {
        const type = (item.related_entity_type || '').toLowerCase()
        return type === 'lease_expired' || !item.read
      })
      setNotifications(sortNotifications(visible))
    } catch (error) {
      console.error('[Header] notifications fetch failed', error)
    }
  }, [sortNotifications])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`manager-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, supabase, user?.id])

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      const type = (notification.related_entity_type || '').toLowerCase()
      if (type !== 'lease_expired' && !notification.read) {
        await fetch('/api/manager/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [notification.id] }),
        })
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      } else if (type !== 'lease_expired') {
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      }
      setNotificationsOpen(false)
      if (type === 'maintenance_request' && notification.related_entity_id) {
        router.push(`/dashboard/maintenance?requestId=${notification.related_entity_id}`)
      } else if (type === 'payment') {
        router.push('/dashboard/payments?tab=deposits')
      } else if (type === 'vacate_notice') {
        const tenantId = notification.sender_user_id
        const noticeId = notification.related_entity_id
        const qs = new URLSearchParams()
        if (noticeId) qs.set('noticeId', noticeId)
        qs.set('tab', 'vacate_notice')
        router.push(tenantId ? `/dashboard/tenants/${tenantId}/lease?${qs.toString()}` : '/dashboard/tenants')
      } else if (type === 'tenant_transition') {
        const caseId = notification.related_entity_id
        if (caseId) {
          router.push(`/dashboard/manager/transitions/${caseId}`)
        } else {
          router.push('/dashboard/manager/transitions')
        }
      } else if (type === 'lease_expired') {
        const tenantId = notification.sender_user_id
        if (tenantId) {
          router.push(`/dashboard/tenants/${tenantId}/lease`)
        } else {
          router.push('/dashboard/tenants')
        }
      } else if (type === 'lease_renewal') {
        const tenantId = notification.sender_user_id
        const renewalId = notification.related_entity_id
        if (tenantId) {
          const qs = renewalId ? `?renewalId=${renewalId}` : ''
          router.push(`/dashboard/tenants/${tenantId}/lease${qs}`)
        } else {
          router.push('/dashboard/tenants')
        }
      } else {
        router.push(
          `/dashboard/tenants/${notification.sender_user_id}/messages?tenantId=${notification.sender_user_id}`
        )
      }
    } catch (error) {
      console.error('[Header] notification navigation failed', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications
      .filter((n) => (n.related_entity_type || '').toLowerCase() !== 'lease_expired')
      .map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await fetch('/api/manager/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      setNotifications((current) =>
        current.filter((item) => (item.related_entity_type || '').toLowerCase() === 'lease_expired')
      )
    } catch (error) {
      console.error('[Header] mark all notifications failed', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
  }

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const tokens = query.split(/\s+/).filter(Boolean)

    const scored = SEARCH_DESTINATIONS.map((dest) => {
      if (!query) {
        return { dest, score: dest.priority ?? 0 }
      }
      const label = dest.label.toLowerCase()
      const description = dest.description.toLowerCase()
      const keywords = (dest.keywords || []).map((k) => k.toLowerCase())

      let score = 0
      if (label.includes(query)) score += 8
      if (description.includes(query)) score += 4
      if (keywords.some((k) => k.includes(query))) score += 5
      tokens.forEach((token) => {
        if (label.includes(token)) score += 4
        if (description.includes(token)) score += 2
        if (keywords.some((k) => k.includes(token))) score += 3
      })
      score += dest.priority ?? 0
      return { dest, score }
    })

    const filtered = query ? scored.filter((item) => item.score > 0) : scored
    return filtered
      .sort((a, b) => b.score - a.score || a.dest.label.localeCompare(b.dest.label))
      .slice(0, 8)
      .map((item) => item.dest)
  }, [searchQuery])

  const handleSearchSelect = (dest: SearchDestination) => {
    router.push(dest.href)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchIndex(-1)
  }

  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center justify-between p-6 max-w-full w-full">
        {/* Search */}
        <div className="flex items-center flex-1 mr-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search tenants, reports, invoices..."
              className="pl-10 pr-10"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setSearchOpen(true)
                setSearchIndex(-1)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                setTimeout(() => setSearchOpen(false), 150)
              }}
              onKeyDown={(event) => {
                if (!searchOpen || searchResults.length === 0) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSearchIndex((idx) => (idx + 1) % searchResults.length)
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSearchIndex((idx) => (idx - 1 + searchResults.length) % searchResults.length)
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const target = searchResults[searchIndex] || searchResults[0]
                  if (target) handleSearchSelect(target)
                }
              }}
            />
            {searchQuery ? (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearchQuery('')
                  setSearchIndex(-1)
                }}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            ) : null}

            {searchOpen ? (
              <div className="absolute left-0 right-0 mt-2 rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
                  <span>{searchQuery ? 'Search results' : 'Suggested pages'}</span>
                  <span>{searchResults.length} results</span>
                </div>
                <div className="max-h-80 overflow-y-auto py-2">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500">
                      No results. Try “arrears”, “maintenance”, or “tenants”.
                    </div>
                  ) : (
                    searchResults.map((dest, idx) => (
                      <button
                        key={dest.href}
                        type="button"
                        onClick={() => handleSearchSelect(dest)}
                        className={`w-full text-left px-4 py-2 transition ${
                          idx === searchIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{dest.label}</div>
                            <div className="text-xs text-slate-500">{dest.description}</div>
                          </div>
                          {dest.category ? (
                            <span className="text-[10px] uppercase tracking-wide text-slate-400">
                              {dest.category}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotificationsOpen(true)}
              className="relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center p-0">
                  {unreadCount}
                </Badge>
              )}
            </Button>
            <SheetContent side="right" className="w-[28rem] px-0">
              <div className="px-6 pt-6 pb-4 border-b border-border/60 bg-gradient-to-r from-[#f4f6fb] to-white sticky top-0 z-10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <SheetTitle className="text-lg flex items-center gap-2">
                      Notifications
                      {expiredCount > 0 && (
                        <Badge className="bg-rose-500/80 text-white rounded-full px-2 py-0.5 text-xs">
                          Lease expired ({expiredCount})
                        </Badge>
                      )}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Stay updated on tenant activity and billing alerts
                    </p>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAllAsRead}
                        className="text-xs mt-2"
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-border text-foreground hover:bg-muted transition"
                      aria-label="Close notifications"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </SheetClose>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No notifications</p>
                ) : (
                  notifications.map((notification) => {
                    const type = (notification.related_entity_type || '').toLowerCase()
                    const isPayment = type === 'payment'
                    const isMaintenance = type === 'maintenance_request'
                    const isLeaseRenewal = type === 'lease_renewal'
                    const isLeaseExpired = type === 'lease_expired'
                    const isVacateNotice = type === 'vacate_notice'
                    const isTransition = type === 'tenant_transition'
                    const rowClasses = isPayment
                      ? 'bg-red-500/10 border-red-200'
                      : isMaintenance
                        ? 'bg-orange-500/10 border-orange-200'
                        : isLeaseRenewal
                          ? 'bg-violet-500/10 border-violet-200'
                          : isLeaseExpired
                            ? 'bg-rose-500/10 border-rose-200'
                            : isVacateNotice
                              ? 'bg-amber-500/10 border-amber-200'
                              : isTransition
                                ? 'bg-indigo-500/10 border-indigo-200'
                          : notification.read
                            ? 'bg-background border-border'
                            : 'bg-primary/5 border-primary/20'

                    return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 rounded-2xl border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm ${rowClasses}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-sm flex items-center gap-2">
                            {isPayment ? (
                              <Badge className="bg-red-500/80 text-white rounded-full px-2 py-0.5">
                                Payment alert
                              </Badge>
                            ) : isMaintenance ? (
                              <Badge className="bg-orange-500/80 text-white rounded-full px-2 py-0.5">
                                Maintenance request
                              </Badge>
                            ) : isLeaseRenewal ? (
                              <Badge className="bg-violet-500/80 text-white rounded-full px-2 py-0.5">
                                Lease renewal
                              </Badge>
                            ) : isLeaseExpired ? (
                              <Badge className="bg-rose-500/80 text-white rounded-full px-2 py-0.5">
                                Lease expired
                              </Badge>
                            ) : isVacateNotice ? (
                              <Badge className="bg-amber-500/80 text-white rounded-full px-2 py-0.5">
                                Vacate notice
                              </Badge>
                            ) : isTransition ? (
                              <Badge className="bg-indigo-500/80 text-white rounded-full px-2 py-0.5">
                                Transition
                              </Badge>
                            ) : null}
                            <span>
                              {isPayment
                                ? 'Payment notice'
                                : isMaintenance
                                  ? 'Maintenance update'
                                  : isLeaseRenewal
                                    ? 'Countersign required'
                                    : isLeaseExpired
                                      ? 'Lease expired'
                                      : isVacateNotice
                                        ? 'Vacate notice'
                                        : isTransition
                                          ? 'Move-out transition'
                                    : 'New tenant message'}
                            </span>
                          </p>
                          <p
                            className={`text-xs mt-2 leading-relaxed ${
                              isLeaseExpired
                                ? 'text-rose-700'
                                : isVacateNotice
                                  ? 'text-amber-700'
                                  : isTransition
                                    ? 'text-indigo-700'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {notification.message_text}
                          </p>
                        </div>
                        {(!notification.read || isLeaseExpired) && (
                          <div className="w-2 h-2 bg-primary rounded-full mt-1 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        {notification.created_at ? formatRelative(notification.created_at) : ''}
                      </p>
                    </button>
                    )
                  })
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 pl-2 pr-1 min-h-[46px] text-gray-900 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:text-gray-100 dark:hover:bg-gray-800"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium">
                    {userFirstName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRoleLabel(
                      userRole ||
                        (user?.user_metadata as any)?.role ||
                        (user as any)?.role
                    )}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/help')}>
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/status')}>
                System Status
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
