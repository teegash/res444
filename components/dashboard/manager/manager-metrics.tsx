'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Home, Users, TrendingUp } from 'lucide-react'

const metrics = [
  {
    title: 'Your Properties',
    value: '5',
    description: 'Active properties',
    icon: Building2,
    color: 'text-blue-500'
  },
  {
    title: 'Your Units',
    value: '42',
    description: 'Total units managed',
    icon: Home,
    color: 'text-green-500'
  },
  {
    title: 'Your Tenants',
    value: '98',
    description: 'Active tenants',
    icon: Users,
    color: 'text-purple-500'
  },
  {
    title: 'Monthly Revenue',
    value: 'KES 890,000',
    description: 'This month',
    icon: TrendingUp,
    color: 'text-amber-500'
  },
]

export function ManagerMetrics() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <Icon className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground">{metric.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
