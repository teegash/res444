'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LayoutDashboard, Users, Wrench, Droplets, MessageSquare, User, LogOut, ChevronDown } from 'lucide-react'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '#' },
  { icon: Users, label: 'Tenants', href: '#' },
  { icon: Wrench, label: 'Maintenance', href: '#' },
  { icon: Droplets, label: 'Water Bills', href: '#' },
  { icon: MessageSquare, label: 'Communications', href: '#' },
]

export function CaretakerSidebar() {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className={cn(
      'bg-sidebar border-r border-sidebar-border transition-all duration-300',
      isOpen ? 'w-64' : 'w-20'
    )}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {isOpen && <div className="font-bold text-lg text-sidebar-foreground">RK</div>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="ml-auto"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Caretaker Badge */}
        {isOpen && (
          <div className="p-4 border-b border-sidebar-border">
            <Badge className="w-full justify-center bg-accent text-accent-foreground">
              Caretaker
            </Badge>
          </div>
        )}

        {/* Menu Items */}
        <nav className="flex-1 p-2 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.label}
                variant="ghost"
                className={cn(
                  'w-full justify-start',
                  isOpen ? 'px-4' : 'px-2 justify-center'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {isOpen && <span className="ml-3 text-sm">{item.label}</span>}
              </Button>
            )
          })}
        </nav>

        {/* Bottom Menu */}
        <div className="border-t border-sidebar-border p-2 space-y-2">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start',
              isOpen ? 'px-4' : 'px-2 justify-center'
            )}
          >
            <User className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span className="ml-3 text-sm">Profile</span>}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start',
              isOpen ? 'px-4' : 'px-2 justify-center'
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span className="ml-3 text-sm">Logout</span>}
          </Button>
        </div>
      </div>
    </div>
  )
}
