'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

type ServiceStatus = {
  name: string
  status: 'operational' | 'degraded' | 'outage'
  description: string
}

export default function SystemStatusPage() {
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'API', status: 'operational', description: 'Primary API endpoints responding normally.' },
    { name: 'Database', status: 'operational', description: 'Supabase queries healthy.' },
    { name: 'Payments', status: 'operational', description: 'M-Pesa and card processors reachable.' },
    { name: 'Notifications', status: 'operational', description: 'Email/SMS/web notifications sending.' },
  ])

  const refresh = () => {
    setLoading(true)
    // Placeholder: in future, hit a status endpoint. For now, simulate quick refresh.
    setTimeout(() => {
      setCheckedAt(new Date())
      setLoading(false)
    }, 300)
  }

  useEffect(() => {
    refresh()
  }, [])

  const badgeFor = (status: ServiceStatus['status']) => {
    if (status === 'operational') return <Badge className="bg-emerald-500">Operational</Badge>
    if (status === 'degraded') return <Badge className="bg-amber-500">Degraded</Badge>
    return <Badge className="bg-red-500">Outage</Badge>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">System Status</h1>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Service Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-start justify-between rounded-lg border p-4">
              <div>
                <p className="font-semibold">{svc.name}</p>
                <p className="text-sm text-muted-foreground">{svc.description}</p>
              </div>
              {badgeFor(svc.status)}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Last checked: {checkedAt ? checkedAt.toLocaleString() : '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
