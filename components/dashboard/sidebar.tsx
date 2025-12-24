'use client'

	import Link from 'next/link'
	import { useState, useEffect, useMemo } from 'react'
	import { usePathname, useRouter } from 'next/navigation'
	import { Button } from '@/components/ui/button'
		import { LayoutDashboard, Building2, Users, CreditCard, Droplet, Wrench, MessageSquare, Bell, BarChart3, FileText, PenLine, Settings, LogOut, Lock, Unlock, Receipt, Camera, Loader2 } from 'lucide-react'
	import { cn } from '@/lib/utils'
	import { useAuth } from '@/lib/auth/context'
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
	import { useToast } from '@/components/ui/use-toast'
	import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Building2, label: 'Properties', href: '/dashboard/properties' },
  { icon: Users, label: 'Tenants', href: '/dashboard/tenants' },
  { icon: CreditCard, label: 'Payments', href: '/dashboard/payments' },
  { icon: Droplet, label: 'Water Bills', href: '/dashboard/water-bills' },
  { icon: Receipt, label: 'Expenses', href: '/dashboard/manager/expenses' },
  { icon: Wrench, label: 'Maintenance', href: '/dashboard/maintenance' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/communications' },
  { icon: Bell, label: 'Notices', href: '/dashboard/manager/notices' },
  { icon: BarChart3, label: 'Reports', href: '/dashboard/manager/reports' },
  { icon: FileText, label: 'Statements', href: '/dashboard/manager/statements' },
  { icon: PenLine, label: 'Lease Renewals', href: '/dashboard/manager/lease-renewals' },
]

	function Sidebar() {
	  const [isExpanded, setIsExpanded] = useState(false)
	  const [isLocked, setIsLocked] = useState(false)
	  const pathname = usePathname()
	  const router = useRouter()
	  const { user } = useAuth()
	  const { toast } = useToast()
	  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
	  const isCaretaker = role === 'caretaker'
	  const canEditOrgLogo = role === 'admin' || role === 'manager'
	  const [organization, setOrganization] = useState<{
	    name: string
	    logo_url: string | null
	  } | null>(null)
	  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
	  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false)
	  const [logoFile, setLogoFile] = useState<File | null>(null)
	  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
	  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

	  // Fetch organization data
	  useEffect(() => {
	    let isMounted = true
	    let retryTimeout: NodeJS.Timeout | null = null

    const fetchOrganization = async () => {
      if (!user) {
        return
      }

      // Small delay to ensure auth context is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100))

      let retries = 0
      const maxRetries = 3

      const attemptFetch = async (): Promise<void> => {
        if (!isMounted) return

        try {
          const response = await fetch('/api/organizations/current', {
            cache: 'no-store',
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              'Content-Type': 'application/json',
            },
          })

          // Handle 404 gracefully
          if (response.status === 404) {
            setOrganization(null)
            return
          }

          if (!response.ok) {
            if (response.status === 401) {
              return
            }
            throw new Error(`API error: ${response.status}`)
          }

          const result = await response.json()

          if (result.success && result.data && result.data.name) {
            if (isMounted) {
              setOrganization({
                name: result.data.name,
                logo_url: result.data.logo_url || null,
              })
            }
          }
        } catch (error) {
          console.error(`[Sidebar] Error fetching organization (attempt ${retries + 1}):`, error)

          if (retries < maxRetries) {
            retries++
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000)
            retryTimeout = setTimeout(() => {
              if (isMounted) attemptFetch()
            }, delay)
          }
        }
      }

      attemptFetch()

      return () => {
        isMounted = false
        if (retryTimeout) clearTimeout(retryTimeout)
      }
    }

    if (user) {
      fetchOrganization()
    }

    return () => {
      isMounted = false
      if (retryTimeout) clearTimeout(retryTimeout)
    }
	  }, [user])

	  useEffect(() => {
	    setLogoLoadFailed(false)
	  }, [organization?.logo_url])

	  useEffect(() => {
	    if (!logoFile) {
	      setLogoPreviewUrl(null)
	      return
	    }
	    const url = URL.createObjectURL(logoFile)
	    setLogoPreviewUrl(url)
	    return () => URL.revokeObjectURL(url)
	  }, [logoFile])

	  const visibleMenuItems = useMemo(() => {
	    if (!isCaretaker) return menuItems
	    const allowed = new Set([
      '/dashboard',
      '/dashboard/tenants',
      '/dashboard/payments',
      '/dashboard/water-bills',
      '/dashboard/communications',
      '/dashboard/maintenance',
    ])
    return menuItems.filter((item) => allowed.has(item.href))
  }, [isCaretaker])

  // Get display name - truncate if too long
	  const displayName = useMemo(() => {
	    if (!organization?.name) {
	      return null
	    }

    const name = organization.name.trim()
    if (name.length > 18) {
      const firstWord = name.split(/\s+/)[0]
      return firstWord.length > 18 ? firstWord.substring(0, 18) : firstWord
    }

	    return name
	  }, [organization?.name])

	  const orgInitials = useMemo(() => {
	    const name = organization?.name?.trim()
	    if (!name) return 'RK'
	    return name
	      .split(/\s+/)
	      .map((word) => word.charAt(0))
	      .join('')
	      .substring(0, 2)
	      .toUpperCase()
	  }, [organization?.name])

	  const { signOut } = useAuth()

	  const handleLogout = async () => {
	    await signOut()
	  }

	  const handleOpenLogoDialog = () => {
	    if (!canEditOrgLogo) return
	    setLogoFile(null)
	    setIsLogoDialogOpen(true)
	  }

	  const handleUploadLogo = async () => {
	    if (!logoFile) {
	      toast({ title: 'Select a logo', description: 'Choose an image to upload.', variant: 'destructive' })
	      return
	    }

	    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
	    if (!allowedTypes.includes(logoFile.type)) {
	      toast({
	        title: 'Invalid file type',
	        description: 'Only JPEG, PNG, and WebP images are allowed.',
	        variant: 'destructive',
	      })
	      return
	    }

	    const maxSize = 5 * 1024 * 1024
	    if (logoFile.size > maxSize) {
	      toast({ title: 'File too large', description: 'Max size is 5MB.', variant: 'destructive' })
	      return
	    }

	    try {
	      setIsUploadingLogo(true)
	      const supabase = createSupabaseClient()
	      const timestamp = Date.now()
	      const ext = logoFile.name.split('.').pop() || 'png'
	      const filePath = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`
	      const bucketName = 'profile-pictures'

	      const { error: uploadErr } = await supabase.storage.from(bucketName).upload(filePath, logoFile, {
	        contentType: logoFile.type,
	        cacheControl: '3600',
	        upsert: false,
	      })
	      if (uploadErr) throw uploadErr

	      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath)
	      const publicUrl = urlData?.publicUrl
	      if (!publicUrl) throw new Error('Failed to get public URL for uploaded logo')

	      const res = await fetch('/api/organizations/logo', {
	        method: 'PUT',
	        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify({ logo_url: publicUrl }),
	      })
	      const json = await res.json().catch(() => ({}))
	      if (!res.ok || !json?.success) {
	        throw new Error(json?.error || 'Failed to update organization logo')
	      }

	      setOrganization((prev) => (prev ? { ...prev, logo_url: publicUrl } : prev))
	      setLogoLoadFailed(false)
	      setIsLogoDialogOpen(false)
	      toast({ title: 'Logo updated', description: 'Your organization logo was updated successfully.' })
	    } catch (e) {
	      toast({
	        title: 'Upload failed',
	        description: e instanceof Error ? e.message : 'Could not upload logo.',
	        variant: 'destructive',
	      })
	    } finally {
	      setIsUploadingLogo(false)
	    }
	  }

  const handleLockToggle = () => {
    setIsLocked(!isLocked)
  }

  const handleMouseEnter = () => {
    if (!isLocked) {
      setIsExpanded(true)
    }
  }

  const handleMouseLeave = () => {
    if (!isLocked) {
      setIsExpanded(false)
    }
  }

  return (
    <>
      <aside 
        className={cn(
          "hidden lg:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ease-in-out",
          isExpanded ? "w-64" : "w-20"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
	        {/* Organization Logo and Name */}
	        <div className="p-6 border-b border-gray-200 min-h-[88px] flex items-center">
	          <div className="flex items-center gap-3 w-full">
	            {/* Logo Container - Always show, size fixed at 40x40px */}
	            <button
	              type="button"
	              onClick={handleOpenLogoDialog}
	              disabled={!canEditOrgLogo}
	              className={cn(
	                'relative group flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm',
	                canEditOrgLogo ? 'cursor-pointer' : 'cursor-default'
	              )}
	              aria-label={canEditOrgLogo ? 'Change organization logo' : 'Organization logo'}
	            >
	              {organization?.logo_url && !logoLoadFailed ? (
	                <img
	                  src={organization.logo_url}
	                  alt={organization.name || 'Organization logo'}
	                  className="w-full h-full object-contain bg-white/95"
	                  onError={() => setLogoLoadFailed(true)}
	                />
	              ) : (
	                <span className="text-white font-bold text-sm">{orgInitials}</span>
	              )}

	              {canEditOrgLogo ? (
	                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/35 flex items-center justify-center">
	                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/95 text-gray-900 shadow-sm">
	                    <Camera className="w-4 h-4" />
	                  </span>
	                </span>
	              ) : null}
	            </button>
            
            {/* Organization Name - Only show when expanded */}
	            {isExpanded && (
	              <div className="overflow-hidden flex-1 min-w-0 max-w-[200px]">
	                <h1 
                  className="text-lg font-bold text-[#4682B4] whitespace-nowrap truncate"
                  title={organization?.name || 'RES'}
                >
                  {displayName || (organization?.name || 'RES')}
                </h1>
                <p className="text-xs text-gray-600 whitespace-nowrap">Manager Portal</p>
	              </div>
	            )}
	          </div>
	        </div>

	        <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
	          <DialogContent className="sm:max-w-md">
	            <DialogHeader>
	              <DialogTitle>Change organization logo</DialogTitle>
	              <DialogDescription>Upload a JPG, PNG, or WebP image (max 5MB).</DialogDescription>
	            </DialogHeader>

	            <div className="space-y-4">
	              <div className="flex items-center gap-4">
	                <div className="w-16 h-16 rounded-xl overflow-hidden border bg-white flex items-center justify-center">
	                  {logoPreviewUrl ? (
	                    <img src={logoPreviewUrl} alt="New logo preview" className="w-full h-full object-contain" />
	                  ) : organization?.logo_url && !logoLoadFailed ? (
	                    <img src={organization.logo_url} alt="Current logo" className="w-full h-full object-contain" />
	                  ) : (
	                    <span className="text-sm font-semibold text-gray-700">{orgInitials}</span>
	                  )}
	                </div>
	                <div className="flex-1">
	                  <input
	                    type="file"
	                    accept="image/png,image/jpeg,image/webp"
	                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
	                    disabled={isUploadingLogo}
	                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
	                  />
	                  <p className="mt-2 text-xs text-gray-500">
	                    Tip: Use a square logo (e.g. 512×512) for best results.
	                  </p>
	                </div>
	              </div>
	            </div>

	            <DialogFooter>
	              <Button
	                type="button"
	                variant="outline"
	                onClick={() => setIsLogoDialogOpen(false)}
	                disabled={isUploadingLogo}
	              >
	                Cancel
	              </Button>
	              <Button type="button" onClick={handleUploadLogo} disabled={isUploadingLogo}>
	                {isUploadingLogo ? (
	                  <>
	                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
	                    Uploading…
	                  </>
	                ) : (
	                  'Save logo'
	                )}
	              </Button>
	            </DialogFooter>
	          </DialogContent>
	        </Dialog>

        {/* Menu Items */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="default"
                  className={cn(
                    "w-full transition-all duration-200 rounded-xl py-3 px-4 my-1 shadow-sm",
                    isExpanded ? "justify-start" : "justify-center",
                    isActive 
                      ? 'bg-[#4682B4] hover:bg-[#3b6a91] text-white shadow-md' 
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/70'
                  )}
                  title={!isExpanded ? item.label : undefined}
                >
                  <Icon className={cn("w-5 h-5", isExpanded && "mr-3")} />
                  {isExpanded && <span className="whitespace-nowrap">{item.label}</span>}
                </Button>
              </Link>
            )
          })}
        </nav>

        {/* Settings and Logout */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {/* Lock Button */}
          <Button
            variant="ghost"
            size="default"
            onClick={handleLockToggle}
            className={cn(
              "w-full transition-all duration-200 py-2 px-4",
              isExpanded ? "justify-start" : "justify-center",
              isLocked ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "text-gray-700 hover:text-gray-900 hover:bg-gray-300/70"
            )}
            title={!isExpanded ? (isLocked ? "Unlock Sidebar" : "Lock Sidebar") : undefined}
          >
            {isLocked ? (
              <>
                <Lock className={cn("w-5 h-5", isExpanded && "mr-3")} />
                {isExpanded && <span className="whitespace-nowrap">Unlock Sidebar</span>}
              </>
            ) : (
              <>
                <Unlock className={cn("w-5 h-5", isExpanded && "mr-3")} />
                {isExpanded && <span className="whitespace-nowrap">Lock Sidebar</span>}
              </>
            )}
          </Button>
          <Link href="/dashboard/settings">
            <Button 
              variant="ghost" 
              size="default" 
              className={cn(
                "w-full transition-all duration-200 py-2 px-4 text-gray-700 hover:text-gray-900 hover:bg-gray-300/70",
                isExpanded ? "justify-start" : "justify-center"
              )}
              title={!isExpanded ? "Settings" : undefined}
            >
              <Settings className={cn("w-5 h-5", isExpanded && "mr-3")} />
              {isExpanded && <span className="whitespace-nowrap">Settings</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="default"
            className={cn(
              "w-full py-2 px-4 text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200",
              isExpanded ? "justify-start" : "justify-center"
            )}
            onClick={handleLogout}
            title={!isExpanded ? "Logout" : undefined}
          >
            <LogOut className={cn("w-5 h-5", isExpanded && "mr-3")} />
            {isExpanded && <span className="whitespace-nowrap">Logout</span>}
          </Button>
        </div>
      </aside>
    </>
  )
}

export { Sidebar }
export default Sidebar
