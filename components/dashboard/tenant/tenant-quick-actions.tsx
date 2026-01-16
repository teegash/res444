'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wrench, MessageSquare, FileText, CreditCard, History, ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'

export function TenantQuickActions() {
  const actions = [
    { 
      icon: Wrench, 
      label: 'Report Issue', 
      color: 'text-red-600', 
      bgColor: 'bg-red-50 hover:bg-red-100',
      href: '/dashboard/tenant/maintenance/new'
    },
    {
      icon: History,
      label: 'Requests',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 hover:bg-orange-100',
      href: '/dashboard/tenant/maintenance'
    },
    { 
      icon: MessageSquare, 
      label: 'Contact Manager', 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-50 hover:bg-blue-100',
      href: '/dashboard/tenant/messages'
    },
    { 
      icon: FileText, 
      label: 'Invoices', 
      color: 'text-indigo-600', 
      bgColor: 'bg-indigo-50 hover:bg-indigo-100',
      href: '/dashboard/tenant/invoices'
    },
    { 
      icon: FileText, 
      label: 'Payment History', 
      color: 'text-green-600', 
      bgColor: 'bg-green-50 hover:bg-green-100',
      href: '/dashboard/tenant/payments'
    },
    { 
      icon: CreditCard, 
      label: 'Lease Details', 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-50 hover:bg-purple-100',
      href: '/dashboard/tenant/lease'
    },
    {
      icon: ArrowLeftRight,
      label: 'Transition',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 hover:bg-indigo-100',
      href: '/dashboard/tenant/transition'
    },
  ]

  return (
    <Card className="bg-gradient-to-br from-orange-50/50 to-yellow-50/30 border-orange-100">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
        <p className="text-sm text-muted-foreground mb-4">Access your most-used features</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={index} href={action.href}>
                <Button
                  variant="outline"
                  className={`w-full h-auto flex-col gap-2 py-4 ${action.bgColor} border-transparent transition-all hover:scale-105`}
                >
                  <Icon className={`h-6 w-6 ${action.color}`} />
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </Button>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
