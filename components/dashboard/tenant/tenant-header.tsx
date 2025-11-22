'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, Settings, LogOut, Home, Camera, Loader2, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
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
    } | null
  } | null
  loading?: boolean
  onProfileUpdated?: () => void
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

export function TenantHeader({ summary, loading, onProfileUpdated }: TenantHeaderProps) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

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
      const sorted = sortNotifications(items)
      setNotifications(sorted)
      setUnreadCount(sorted.filter((item) => !item.read).length)
    },
    [sortNotifications]
  )

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
      setNotifications((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== record.id)
        return sortNotifications([record, ...withoutDuplicate])
      })
      if (!record.read) {
        setUnreadCount((prev) => prev + 1)
      }
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
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await fetch('/api/tenant/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      setNotifications((current) =>
        sortNotifications(current.map((item) => ({ ...item, read: true })))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error('[TenantHeader] mark all as read failed', error)
    }
  }

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      if (!notification.read) {
        await fetch('/api/tenant/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [notification.id] }),
        })
      }
      setNotifications((current) =>
        sortNotifications(
          current.map((item) =>
            item.id === notification.id ? { ...item, read: true } : item
          )
        )
      )
      if (!notification.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
      setSheetOpen(false)
      const invoiceId =
        notification.related_entity_id &&
        notification.related_entity_id !== 'null' &&
        notification.related_entity_id !== 'undefined'
          ? notification.related_entity_id
          : null
      if (notification.related_entity_type === 'payment') {
        if (!invoiceId) {
          toast({
            title: 'Invoice unavailable',
            description: 'This notification is no longer linked to an invoice.',
            variant: 'destructive',
          })
          return
        }
        router.push(`/dashboard/tenant/invoices/${encodeURIComponent(invoiceId)}?invoiceId=${encodeURIComponent(invoiceId)}`)
      } else {
        router.push('/dashboard/tenant/messages')
      }
    } catch (error) {
      console.error('[TenantHeader] failed to open notification', error)
    }
  }

  const openUploadModal = () => {
    setSelectedFile(null)
    setPreviewUrl(summary?.profile?.profile_picture_url || null)
    setUploadOpen(true)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const objectUrl = URL.createObjectURL(file)
      setPreviewUrl(objectUrl)
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please choose an image to upload.',
        variant: 'destructive',
      })
      return
    }

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/tenant/profile-picture', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to upload profile photo.')
      }

      toast({ title: 'Profile updated', description: 'Your photo has been saved.' })
      setUploadOpen(false)
      setSelectedFile(null)
      setPreviewUrl(null)
      onProfileUpdated?.()
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleLogout = () => {
    router.push('/auth/login')
  }

  const fullName =
    summary?.profile?.full_name ||
    (user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ')[0] : null) ||
    user?.email?.split('@')[0] ||
    'Resident'
  const propertyName = summary?.lease?.property_name || 'Your Property'
  const unitLabel = summary?.lease?.unit_label || summary?.lease?.property_location || 'Stay connected'
  const profileImage = summary?.profile?.profile_picture_url || null

  return (
    <Card className="border border-white/60 shadow-sm bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/50 sticky top-0 z-10">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={openUploadModal}
              className="relative w-20 h-20 rounded-2xl border border-dashed border-slate-200 overflow-hidden group"
            >
              {profileImage ? (
                <img src={profileImage} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 text-xs">
                  <Camera className="w-5 h-5 mb-1" />
                  Add Photo
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-xs">
                <Camera className="w-4 h-4 mb-1" />
                Edit
              </div>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {loading ? 'Loading...' : `Welcome home, ${fullName}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                {loading ? 'Fetching your details…' : `${propertyName} • ${unitLabel}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-red-600">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-96 px-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-gradient-to-r from-[#f4f6fb] to-white sticky top-0 z-10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <SheetTitle className="text-lg">Notifications</SheetTitle>
                      <SheetDescription>Latest updates from your property team.</SheetDescription>
                      {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs mt-2">
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
                </SheetHeader>
                <div className="space-y-3 px-6 py-4 max-h-[70vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => {
                      const isPayment =
                        (notification.related_entity_type || '').toLowerCase() === 'payment'
                      const rowClasses = isPayment
                        ? 'bg-red-50 border-red-200'
                        : notification.read
                          ? 'bg-white border-gray-200'
                          : 'bg-blue-50 border-blue-200'
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full text-left p-4 rounded-lg border transition ${rowClasses}`}
                        >
                          <div className="flex items-start justify-between mb-1">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                              {isPayment && (
                                <Badge className="bg-red-500 text-white rounded-full px-2 py-0.5 text-[10px]">
                                  Payment
                                </Badge>
                              )}
                              <span>{isPayment ? 'Payment notice' : 'New message'}</span>
                            </h4>
                            {!notification.read && <Badge className="bg-[#4682B4]">New</Badge>}
                          </div>
                          <p className={`text-sm mb-2 ${isPayment ? 'text-red-700' : 'text-gray-600'}`}>
                            {notification.message_text}
                          </p>
                          <p className="text-xs text-gray-500">
                            {notification.created_at ? formatRelative(notification.created_at) : ''}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard/tenant/profile')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update profile photo</DialogTitle>
            <DialogDescription>Upload a clear image so your property team can recognize you.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="w-full flex items-center justify-center">
              {previewUrl || profileImage ? (
                <img
                  src={previewUrl || profileImage || ''}
                  alt="Preview"
                  className="w-40 h-40 rounded-2xl object-cover border"
                />
              ) : (
                <div className="w-40 h-40 rounded-2xl border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                  No photo selected
                </div>
              )}
            </div>
            <Input type="file" accept="image/*" onChange={handleFileChange} />
          </div>
          <DialogFooter>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
