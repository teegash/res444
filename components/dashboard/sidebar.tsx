'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Building2, Users, CreditCard, Droplet, Wrench, MessageSquare, Bell, BarChart3, FileText, Settings, LogOut, Lock, Unlock, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'

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
]

function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
  const isCaretaker = role === 'caretaker'
  const [organization, setOrganization] = useState<{
    name: string
    logo_url: string | null
  } | null>(null)

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

  const { signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
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
            <div className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm">
              {organization?.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name || 'Organization logo'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error('[Sidebar] Logo image failed to load:', organization.logo_url)
                    // Fallback to first letters on error
                    const parent = e.currentTarget.parentElement
                    if (parent && organization?.name) {
                      const initials = organization.name
                        .split(' ')
                        .map(word => word.charAt(0))
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()
                      parent.className = "flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm"
                      parent.innerHTML = `<span class="text-white font-bold text-sm">${initials}</span>`
                    }
                  }}
                  onLoad={() => {
                    console.log('[Sidebar] ✓ Logo image loaded successfully')
                  }}
                />
              ) : organization?.name ? (
                // Show first letters of organization name if no logo
                <span className="text-white font-bold text-sm">
                  {organization.name
                    .split(' ')
                    .map(word => word.charAt(0))
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </span>
              ) : (
                // Fallback to RES logo while loading
                <span className="text-white font-bold text-lg">RK</span>
              )}
            </div>
            
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
