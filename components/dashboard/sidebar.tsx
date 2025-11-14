'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Building2, Users, CreditCard, Droplet, Wrench, MessageSquare, Bell, BarChart3, FileText, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    router.push('/auth/login')
  }

  return (
    <>
      <aside 
        className={cn(
          "hidden lg:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ease-in-out",
          isExpanded ? "w-64" : "w-20"
        )}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-200 min-h-[88px] flex items-center">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-10 h-10 bg-[#4682B4] rounded-lg flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            {isExpanded && (
              <div className="overflow-hidden">
                <h1 className="text-lg font-bold text-[#4682B4] whitespace-nowrap">RentalKenya</h1>
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
