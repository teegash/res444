'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, LogOut } from 'lucide-react'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth/context'

interface Notification {
  id: string
  title: string
  description: string
  timestamp: string
  type: 'info' | 'warning' | 'success' | 'error'
  read: boolean
}

export function Header() {
  const { user } = useAuth()
  const [organization, setOrganization] = useState<{
    name: string
    logo_url: string | null
  } | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'Payment Received',
      description: 'John Doe paid KES 10,000 for Unit 101',
      timestamp: '2 minutes ago',
      type: 'success',
      read: false,
    },
    {
      id: '2',
      title: 'Maintenance Request',
      description: 'New maintenance request for Unit 205',
      timestamp: '1 hour ago',
      type: 'info',
      read: false,
    },
    {
      id: '3',
      title: 'Lease Expiring',
      description: 'Jane Smith lease expires in 15 days',
      timestamp: '3 hours ago',
      type: 'warning',
      read: false,
    },
  ])
  const unreadCount = notifications.filter(n => !n.read).length
  const router = useRouter()

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      if (!user) return

      try {
        const response = await fetch('/api/organizations/current')
        const result = await response.json()

        if (result.success && result.data) {
          setOrganization({
            name: result.data.name,
            logo_url: result.data.logo_url,
          })
        }
      } catch (error) {
        console.error('Error fetching organization:', error)
      }
    }

    fetchOrganization()
  }, [user])

  const handleMarkAsRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const handleLogout = () => {
    router.push('/auth/login')
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
                    <div
                      key={notification.id}
                      onClick={() => handleMarkAsRead(notification.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        notification.read
                          ? 'bg-background border-border'
                          : 'bg-primary/5 border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notification.description}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full mt-1 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {notification.timestamp}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-2 pr-1">
                <Avatar className="w-8 h-8">
                  {organization?.logo_url ? (
                    <AvatarImage src={organization.logo_url} alt={organization.name} />
                  ) : (
                    <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Maurice" />
                  )}
                  <AvatarFallback>
                    {organization?.name 
                      ? organization.name.substring(0, 2).toUpperCase()
                      : 'MR'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium">
                    {organization?.name || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {organization?.name ? 'Organization' : 'Manager'}
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
