'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, LogOut, User } from 'lucide-react'
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

export function Header() {
  const { user, signOut } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [userFirstName, setUserFirstName] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const unreadCount = notifications.filter((n) => !n.read).length
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
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }

    fetchUserFirstName()
  }, [user])

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/notifications', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to fetch notifications.')
      }
      const payload = await response.json()
      setNotifications(payload.data || [])
    } catch (error) {
      console.error('[Header] notifications fetch failed', error)
    }
  }, [])

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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, supabase, user?.id])

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      if (!notification.read) {
        await fetch('/api/manager/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [notification.id] }),
        })
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      } else {
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      }
      setNotificationsOpen(false)
      router.push(`/dashboard/tenants/${notification.sender_user_id}/messages?tenantId=${notification.sender_user_id}`)
    } catch (error) {
      console.error('[Header] notification navigation failed', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await fetch('/api/manager/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      setNotifications([])
    } catch (error) {
      console.error('[Header] mark all notifications failed', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
  }

  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center justify-between p-6 max-w-full w-full">
        {/* Search */}
        <div className="flex items-center flex-1 mr-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search properties, tasks, etc..."
              className="pl-10"
            />
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
            <SheetContent side="right" className="w-96">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle>Notifications</SheetTitle>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleMarkAllAsRead}
                      className="text-xs"
                    >
                      Mark all as read
                    </Button>
                  )}
                </div>
              </SheetHeader>
              <div className="space-y-3 mt-6">
                {notifications.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No notifications</p>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-3 rounded-lg border cursor-pointer transition-colors ${
                        notification.read ? 'bg-background border-border' : 'bg-primary/5 border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">New tenant message</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notification.message_text}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full mt-1 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {notification.created_at ? formatRelative(notification.created_at) : ''}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-2 pr-1">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium">
                    {userFirstName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Manager
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Account & Security
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Help & Support
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
