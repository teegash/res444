'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Wrench, Plus, MessageSquare, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type MaintenanceRequest = {
  id: string
  title: string
  description: string
  priority_level: string
  status: string
  created_at: string
  attachment_urls: string[] | null
}

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/tenant/maintenance/requests', { cache: 'no-store' })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to fetch maintenance requests.')
        }
        const payload = await response.json()
        setRequests(payload.data || [])
      } catch (err) {
        console.error('[TenantMaintenanceList] fetch failed', err)
        setError(err instanceof Error ? err.message : 'Unable to load maintenance requests.')
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [])

  const stats = useMemo(() => {
    const open = requests.filter((req) => req.status === 'open').length
    const inProgress = requests.filter((req) => req.status === 'in_progress' || req.status === 'assigned').length
    const completed = requests.filter((req) => req.status === 'completed').length
    return { open, inProgress, completed }
  }, [requests])

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700'
      case 'urgent':
        return 'bg-red-600 text-white'
      case 'medium':
        return 'bg-orange-100 text-orange-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-700'
      case 'in_progress':
      case 'assigned':
        return 'bg-amber-100 text-amber-700'
      case 'completed':
        return 'bg-emerald-100 text-emerald-700'
      case 'cancelled':
        return 'bg-slate-200 text-slate-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Maintenance Requests</h1>
              <p className="text-sm text-white/80">Track your requests and their progress</p>
            </div>
          </div>
          <Link href="/dashboard/tenant/maintenance/new" className="ml-auto">
            <Button className="bg-orange-500 hover:bg-orange-600 gap-2">
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-orange-600 font-semibold text-lg">{stats.open}</CardDescription>
              <CardTitle className="text-sm">Open Requests</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-blue-600 font-semibold text-lg">{stats.inProgress}</CardDescription>
              <CardTitle className="text-sm">In Progress</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/95">
            <CardHeader className="pb-3">
              <CardDescription className="text-green-600 font-semibold text-lg">{stats.completed}</CardDescription>
              <CardTitle className="text-sm">Completed</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Your Maintenance Requests</CardTitle>
            <CardDescription>Track the status of your maintenance requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Loading your requests…
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                You haven&apos;t submitted any maintenance requests yet.
              </div>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 rounded-lg border"
                  style={{ backgroundColor: request.status === 'completed' ? '#ecfdf5' : '#f8fafc' }}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-lg">{request.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{request.description.split('\n')[0]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={priorityColor(request.priority_level)}>{request.priority_level}</Badge>
                      <Badge className={statusColor(request.status)}>
                        {request.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <p>
                      Submitted:{' '}
                      <span className="text-foreground font-medium">{formatDate(request.created_at)}</span>
                    </p>
                    {request.attachment_urls && request.attachment_urls.length > 0 && (
                      <p>
                        Attachments:{' '}
                        <span className="text-foreground font-medium">{request.attachment_urls.length}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
            <CardDescription>Common maintenance actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <Plus className="h-5 w-5 text-blue-600 mb-2" />
                <p className="font-medium mb-1">Report New Issue</p>
                <p className="text-xs text-muted-foreground mb-3">Submit a new maintenance request</p>
                <Link href="/dashboard/tenant/maintenance/new">
                  <Button size="sm" variant="outline" className="w-full">
                    Create Request
                  </Button>
                </Link>
              </div>
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <MessageSquare className="h-5 w-5 text-green-600 mb-2" />
                <p className="font-medium mb-1">Contact Management</p>
                <p className="text-xs text-muted-foreground mb-3">Send a message to property manager</p>
                <Link href="/dashboard/tenant/messages">
                  <Button size="sm" variant="outline" className="w-full">
                    Send Message
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
