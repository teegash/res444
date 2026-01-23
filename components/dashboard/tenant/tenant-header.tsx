'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { TenantNavGrid } from '@/components/navigation/tenant-nav-grid'
import { useTenantNavItems } from '@/components/navigation/use-tenant-nav-items'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

interface NotificationItem {
  id: string
  sender_user_id?: string | null
  message_text: string
  created_at: string
  read: boolean
  related_entity_type?: string | null
  related_entity_id?: string | null
}

interface TenantHeaderProps {
  summary?: {
    profile: {
      full_name: string | null
      profile_picture_url: string | null
    } | null
    lease: {
      property_name: string | null
      property_location: string | null
      unit_label: string | null
      end_date?: string | null
    } | null
  } | null
  loading?: boolean
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

export function TenantHeader({ summary, loading }: TenantHeaderProps) {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerSummary, setHeaderSummary] = useState<TenantHeaderProps['summary']>(summary ?? null)
  const [summaryLoading, setSummaryLoading] = useState(Boolean(loading))
  const { menuItems, activeKey } = useTenantNavItems()
  const effectiveSummary = summary !== undefined ? summary : headerSummary
  const isLoading = summary !== undefined ? Boolean(loading) : summaryLoading

  useEffect(() => {
    if (summary !== undefined) {
      setHeaderSummary(summary ?? null)
      setSummaryLoading(Boolean(loading))
    }
  }, [summary, loading])

  useEffect(() => {
    if (summary !== undefined) return
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true)
        const response = await fetch('/api/tenant/summary', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const payload = await response.json().catch(() => ({}))
        setHeaderSummary(payload.data || null)
      } catch {
        // ignore summary errors for header rendering
      } finally {
        setSummaryLoading(false)
      }
    }
    fetchSummary()
  }, [summary])
  const leaseExpired = useMemo(() => {
    const endDate = effectiveSummary?.lease?.end_date
    if (!endDate || isLoading) return false
    const parsed = new Date(endDate)
    if (Number.isNaN(parsed.getTime())) return false
    const today = new Date()
    const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return currentDay > endDay
  }, [effectiveSummary?.lease?.end_date, isLoading])
  const leaseExpiryDateLabel = useMemo(() => {
    if (!effectiveSummary?.lease?.end_date) return null
    const parsed = new Date(effectiveSummary.lease.end_date)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }, [effectiveSummary?.lease?.end_date])

  const sortNotifications = useCallback((items: NotificationItem[]) => {
    return [...items].sort((a, b) => {
      const aPayment = (a.related_entity_type || '').toLowerCase() === 'payment'
      const bPayment = (b.related_entity_type || '').toLowerCase() === 'payment'
      if (aPayment !== bPayment) {
        return aPayment ? -1 : 1
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })
  }, [])

  const syncNotifications = useCallback(
    (items: NotificationItem[]) => {
      const unreadItems = items.filter((item) => !item.read)
      const sorted = sortNotifications(unreadItems)
      setNotifications(sorted)
    },
    [sortNotifications]
  )
  const unreadCount = notifications.filter((item) => !item.read).length

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/notifications', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to load notifications.')
      }
      const payload = await response.json()
      const rows: NotificationItem[] = Array.isArray(payload.data) ? payload.data : []
      syncNotifications(rows)
    } catch (error) {
      console.error('[TenantHeader] fetch notifications failed', error)
    }
  }, [syncNotifications])

  const handleNewNotification = useCallback(
    (record: NotificationItem | null) => {
      if (!record) {
        fetchNotifications()
        return
      }
      if (record.read) return
      setNotifications((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== record.id)
        return sortNotifications([record, ...withoutDuplicate])
      })
    },
    [fetchNotifications, sortNotifications]
  )

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (sheetOpen) {
      fetchNotifications()
    }
  }, [sheetOpen, fetchNotifications])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`tenant-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const record = (payload as { new?: NotificationItem }).new || null
          handleNewNotification(record)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [handleNewNotification, supabase, user?.id])

  const markAllAsRead = async () => {
    const unreadIds = notifications
      .filter((n) => (n.related_entity_type || '').toLowerCase() !== 'lease_expired')
      .map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await fetch('/api/tenant/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      setNotifications([])
    } catch (error) {
      console.error('[TenantHeader] mark all as read failed', error)
    }
  }

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      const relatedType = (notification.related_entity_type || '').toLowerCase()
      if (relatedType === 'lease_expired') {
        setSheetOpen(false)
        router.push('/dashboard/tenant/lease')
        return
      }
      if (!notification.read) {
        await fetch('/api/tenant/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [notification.id] }),
        })
      }
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      setSheetOpen(false)
      if (relatedType === 'payment') {
        // Payment-related notifications should take the tenant to payment history (incl. deposit slip outcomes).
        // We intentionally do not force an invoice detail route because many notifications are payment-centric.
        router.push('/dashboard/tenant/payments')
      } else if (relatedType === 'vacate_notice') {
        const qs = notification.related_entity_id ? `?noticeId=${notification.related_entity_id}` : ''
        router.push(`/dashboard/tenant/lease${qs}`)
      } else if (relatedType === 'maintenance_request') {
        const qs = notification.related_entity_id
          ? `?requestId=${notification.related_entity_id}`
          : ''
        router.push(`/dashboard/tenant/maintenance${qs}`)
      } else if (relatedType === 'tenant_transition') {
        router.push('/dashboard/tenant/transition')
      } else {
        router.push('/dashboard/tenant/messages')
      }
    } catch (error) {
      console.error('[TenantHeader] failed to open notification', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
  }

  const fullName =
    effectiveSummary?.profile?.full_name ||
    (user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ')[0] : null) ||
    user?.email?.split('@')[0] ||
    'Resident'
  const propertyName = effectiveSummary?.lease?.property_name || 'Your Property'
  const unitLabel =
    effectiveSummary?.lease?.unit_label ||
    effectiveSummary?.lease?.property_location ||
    propertyName ||
    'Stay connected'
  const profileImage = effectiveSummary?.profile?.profile_picture_url || null

  return (
    <Card className="border border-white/60 shadow-sm bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/50 sticky top-0 z-10">
      <div className="px-3 py-0 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center gap-0.5 md:gap-4">
          <div className="order-1">
            <div className="relative w-8 h-8 md:w-20 md:h-20 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
              {profileImage ? (
                <img src={profileImage} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[9px] md:text-xs">
                  {fullName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="order-2 ml-auto md:order-3 md:ml-auto flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open tenant menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[92vw] max-w-[360px] px-0 sm:w-96 sm:max-w-none">
                <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/60 bg-gradient-to-r from-[#f4f6fb] to-white sticky top-0 z-10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <SheetTitle className="text-base sm:text-lg">Menu</SheetTitle>
                      <SheetDescription className="text-xs sm:text-sm">
                        Quick access to your tenant portal.
                      </SheetDescription>
                    </div>
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-border text-foreground hover:bg-muted transition"
                        aria-label="Close menu"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </SheetClose>
                  </div>
                </SheetHeader>
                <div className="px-4 py-3 sm:px-6 overflow-hidden">
                  <TenantNavGrid
                    items={menuItems}
                    activeKey={activeKey}
                    columns="grid-cols-2"
                    onSelect={() => setMenuOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
            {leaseExpired && (
              <Badge className="bg-rose-600 text-white text-[10px] px-2 py-1">
                Lease expired
              </Badge>
            )}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-4 h-4 md:w-5 md:h-5" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-red-600">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[92vw] max-w-[360px] px-0 sm:w-96 sm:max-w-none">
                <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/60 bg-gradient-to-r from-[#f4f6fb] to-white sticky top-0 z-10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <SheetTitle className="text-base sm:text-lg">Notifications</SheetTitle>
                      <SheetDescription className="text-xs sm:text-sm">
                        Latest updates from your property team.
                      </SheetDescription>
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={markAllAsRead}
                          className="text-[11px] sm:text-xs mt-2"
                        >
                          Mark all as read
                        </Button>
                      )}
                    </div>
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-border text-foreground hover:bg-muted transition"
                        aria-label="Close notifications"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </SheetClose>
                  </div>
                </SheetHeader>
                <div className="space-y-2 sm:space-y-3 px-4 py-3 sm:px-6 sm:py-4 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto">
                  {leaseExpired && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs sm:text-sm font-semibold text-rose-800">Lease expired</p>
                          <p className="text-[11px] sm:text-xs text-rose-700 mt-1">
                            Your lease ended{leaseExpiryDateLabel ? ` on ${leaseExpiryDateLabel}` : ''}. Please renew to
                            avoid interruptions.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-black text-xs"
                          onClick={() => {
                            setSheetOpen(false)
                            router.push('/dashboard/tenant/lease')
                          }}
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                  )}
                  {notifications.length === 0 && !leaseExpired ? (
                    <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => {
                      const isPayment =
                        (notification.related_entity_type || '').toLowerCase() === 'payment'
                      const isLeaseExpired =
                        (notification.related_entity_type || '').toLowerCase() === 'lease_expired'
                      const isVacateNotice =
                        (notification.related_entity_type || '').toLowerCase() === 'vacate_notice'
                      const isTransition =
                        (notification.related_entity_type || '').toLowerCase() === 'tenant_transition'
                      const rowClasses = isPayment
                        ? 'bg-red-50 border-red-200'
                        : isLeaseExpired
                          ? 'bg-rose-50 border-rose-200'
                          : isVacateNotice
                            ? 'bg-amber-50 border-amber-200'
                            : isTransition
                              ? 'bg-indigo-50 border-indigo-200'
                              : notification.read
                                ? 'bg-white border-gray-200'
                                : 'bg-blue-50 border-blue-200'
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full text-left p-3 sm:p-4 rounded-lg border transition ${rowClasses}`}
                        >
                          <div className="flex items-start justify-between mb-1">
                            <h4 className="font-semibold text-xs sm:text-sm flex items-center gap-2">
                              {isPayment && (
                                <Badge className="bg-red-500 text-white rounded-full px-2 py-0.5 text-[9px] sm:text-[10px]">
                                  Payment
                                </Badge>
                              )}
                              {isLeaseExpired && (
                                <Badge className="bg-rose-600 text-white rounded-full px-2 py-0.5 text-[9px] sm:text-[10px]">
                                  Lease expired
                                </Badge>
                              )}
                              {isVacateNotice && (
                                <Badge className="bg-amber-500 text-white rounded-full px-2 py-0.5 text-[9px] sm:text-[10px]">
                                  Vacate
                                </Badge>
                              )}
                              {isTransition && (
                                <Badge className="bg-indigo-500 text-white rounded-full px-2 py-0.5 text-[9px] sm:text-[10px]">
                                  Transition
                                </Badge>
                              )}
                              <span>
                                {isPayment
                                  ? 'Payment notice'
                                  : isLeaseExpired
                                    ? 'Lease expired'
                                    : isVacateNotice
                                      ? 'Vacate notice'
                                      : 'New message'}
                              </span>
                            </h4>
                            {!notification.read && (
                              <Badge className="bg-[#4682B4] text-[10px] sm:text-xs">New</Badge>
                            )}
                          </div>
                          <p
                            className={`text-xs sm:text-sm mb-2 ${
                              isPayment
                                ? 'text-red-700'
                                : isLeaseExpired
                                  ? 'text-rose-700'
                                  : isVacateNotice
                                    ? 'text-amber-700'
                                    : 'text-gray-600'
                            }`}
                          >
                            {notification.message_text}
                          </p>
                          <p className="text-[11px] sm:text-xs text-gray-500">
                            {notification.created_at ? formatRelative(notification.created_at) : ''}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <Button
              type="button"
              onClick={handleLogout}
              size="icon"
              className="rounded-full bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-sm shadow-red-500/30 border border-white/15 hover:from-red-700 hover:to-rose-600 hover:shadow-md hover:shadow-red-500/35 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-red-500/40"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </div>

          <div className="order-3 w-full md:order-2 md:w-auto">
            <h1 className="text-[13px] md:text-2xl font-bold text-foreground leading-tight">
              {isLoading ? 'Loading...' : `Welcome ${fullName}`}
            </h1>
            <p className="text-[10px] md:text-sm text-muted-foreground leading-tight">
              {isLoading ? 'Fetching your details…' : unitLabel}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
