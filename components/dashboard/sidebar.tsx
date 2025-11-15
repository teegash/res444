'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Building2, Users, CreditCard, Droplet, Wrench, MessageSquare, Bell, BarChart3, FileText, Settings, LogOut, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Building2, label: 'Properties', href: '/dashboard/properties' },
  { icon: Users, label: 'Tenants', href: '/dashboard/tenants' },
  { icon: CreditCard, label: 'Payments', href: '/dashboard/payments' },
  { icon: Droplet, label: 'Water Bills', href: '/dashboard/water-bills' },
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
  const [organization, setOrganization] = useState<{
    name: string
    logo_url: string | null
  } | null>(null)

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      if (!user) {
        console.log('No user, skipping organization fetch')
        return
      }

      try {
        console.log('Fetching organization data for user:', user.id)
        const response = await fetch('/api/organizations/current', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        })
        
        if (!response.ok) {
          console.error('Failed to fetch organization:', response.status, response.statusText)
          return
        }

        const result = await response.json()
        console.log('Organization fetch result:', result)

        if (result.success && result.data) {
          console.log('Setting organization:', result.data.name, result.data.logo_url)
          setOrganization({
            name: result.data.name,
            logo_url: result.data.logo_url,
          })
        } else {
          console.log('No organization data in result:', result)
        }
      } catch (error) {
        console.error('Error fetching organization:', error)
      }
    }

    fetchOrganization()
  }, [user])

  const handleLogout = () => {
    router.push('/auth/login')
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
                    console.error('Failed to load organization logo:', organization.logo_url)
                    // On error, show first letter fallback
                    const parent = e.currentTarget.parentElement
                    if (parent && organization?.name) {
                      const firstLetter = organization.name.charAt(0).toUpperCase()
                      parent.className = "flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm"
                      parent.innerHTML = `<span class="text-white font-bold text-lg">${firstLetter}</span>`
                    }
                  }}
                />
              ) : organization?.name ? (
                // Show first letter of organization name if no logo
                <span className="text-white font-bold text-lg">
                  {organization.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                // Fallback while loading or no organization
                <span className="text-white font-bold text-lg">?</span>
              )}
            </div>
            
            {/* Organization Name - Only show when expanded */}
            {isExpanded && (
              <div className="overflow-hidden flex-1 min-w-0">
                <h1 className="text-lg font-bold text-[#4682B4] whitespace-nowrap truncate">
                  {organization?.name || 'Loading...'}
                </h1>
                <p className="text-xs text-gray-600 whitespace-nowrap">Manager Portal</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="default"
                  className={cn(
                    "w-full transition-all duration-200",
                    isExpanded ? "justify-start" : "justify-center px-0",
                    isActive ? 'bg-[#4682B4] hover:bg-[#4682B4]/90' : ''
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
        <div className="p-3 border-t border-gray-200 space-y-1">
          {/* Lock Button */}
          <Button
            variant="ghost"
            size="default"
            onClick={handleLockToggle}
            className={cn(
              "w-full transition-all duration-200",
              isExpanded ? "justify-start" : "justify-center px-0",
              isLocked ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : ""
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
                "w-full transition-all duration-200",
                isExpanded ? "justify-start" : "justify-center px-0"
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
              "w-full text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200",
              isExpanded ? "justify-start" : "justify-center px-0"
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
