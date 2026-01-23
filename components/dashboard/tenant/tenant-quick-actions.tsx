'use client'

import { useRouter } from 'next/navigation'
import { QuickLinksCard } from '@/components/ui/card-2'
import { useTenantNavItems } from '@/components/navigation/use-tenant-nav-items'

export function TenantQuickActions() {
  const router = useRouter()
  const { quickActionItems } = useTenantNavItems()

  const actionTone: Record<string, string> = {
    pay: 'border-emerald-200 text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/70',
    payments: 'border-blue-200 text-blue-700 bg-blue-50/80 hover:bg-blue-100/70',
    invoices: 'border-purple-200 text-purple-700 bg-purple-50/80 hover:bg-purple-100/70',
    maintenance: 'border-orange-200 text-orange-700 bg-orange-50/80 hover:bg-orange-100/70',
    messages: 'border-sky-200 text-sky-700 bg-sky-50/80 hover:bg-sky-100/70',
    lease: 'border-yellow-200 text-yellow-700 bg-yellow-50/80 hover:bg-yellow-100/70',
  }

  const actions = quickActionItems.map((item) => ({
    icon: <item.icon className="h-full w-full" />,
    label: item.label,
    onClick: () => {
      if (item.href) {
        router.push(item.href)
      } else {
        item.onClick?.()
      }
    },
    className: actionTone[item.key] || 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300',
  }))

  return (
    <QuickLinksCard
      title="Quick Actions"
      subtitle="Access your most-used features"
      actions={actions}
      className="bg-gradient-to-br from-orange-50/50 to-yellow-50/30 border-orange-100"
    />
  )
}
