'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wrench, Plus, MessageSquare, Loader2, FileText, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'

type MaintenanceRequest = {
  id: string
  title: string
  description: string
  priority_level: string | null
  status: string | null
  created_at: string
  updated_at?: string | null
  attachment_urls: string[] | null
  assigned_to_name?: string | null
  assigned_technician_phone?: string | null
  maintenance_cost?: number | null
  maintenance_cost_paid_by?: 'tenant' | 'landlord' | null
  maintenance_cost_notes?: string | null
}

export default function TenantMaintenancePage() {
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

  const priorityBadge = (priority?: string | null) => {
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

  const statusBadge = (status?: string | null) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-700'
      case 'assigned':
      case 'in_progress':
        return 'bg-amber-100 text-amber-700'
      case 'completed':
        return 'bg-emerald-100 text-emerald-700'
      case 'cancelled':
        return 'bg-slate-200 text-slate-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const formatCurrency = (value?: number | null) => {
    const amount = Number(value || 0)
    return `KES ${amount.toLocaleString()}`
  }

  const responseMessage = (request: MaintenanceRequest) => {
    if (request.status === 'completed') {
      return 'Issue resolved. Let us know if you need further assistance.'
    }
    if (request.assigned_to_name) {
      const phoneSuffix = request.assigned_technician_phone ? ` (${request.assigned_technician_phone})` : ''
      return `Technician ${request.assigned_to_name}${phoneSuffix} has been assigned.`
    }
    return 'Our maintenance team is reviewing your request.'
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/tenant">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Wrench className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Maintenance History</h1>
              <p className="text-sm text-muted-foreground">Track your requests and follow up on progress</p>
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
          <Card className="bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Open requests</CardTitle>
              <CardDescription className="text-3xl font-semibold text-orange-600">{stats.open}</CardDescription>
              <p className="text-xs text-muted-foreground mt-1">Awaiting assignment</p>
            </CardHeader>
          </Card>
          <Card className="bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">In progress</CardTitle>
              <CardDescription className="text-3xl font-semibold text-blue-600">{stats.inProgress}</CardDescription>
              <p className="text-xs text-muted-foreground mt-1">Technicians on site</p>
            </CardHeader>
          </Card>
          <Card className="bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Resolved</CardTitle>
              <CardDescription className="text-3xl font-semibold text-green-600">{stats.completed}</CardDescription>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Request history</CardTitle>
            <CardDescription>Your past maintenance submissions and current statuses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <SkeletonTable rows={4} columns={4} />
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                You haven&apos;t submitted any maintenance requests yet.
              </div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-100 p-5 shadow-sm bg-white">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{formatDate(request.created_at)}</p>
                      <h3 className="text-lg font-semibold text-slate-900">{request.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {request.description.split('\n')[0]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={priorityBadge(request.priority_level)}>{request.priority_level || 'medium'}</Badge>
                      <Badge className={statusBadge(request.status)}>
                        {(request.status || 'open').replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm text-muted-foreground">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Response</p>
                      <p className="text-slate-900 font-medium">{responseMessage(request)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Status updated</p>
                      <p className="text-slate-900 font-medium">
                        {request.updated_at ? formatDate(request.updated_at) : 'Pending'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Attachments</p>
                      <p className="text-slate-900 font-medium">
                        {request.attachment_urls?.length || 0} file(s)
                      </p>
                    </div>
                    <div
                      className={`rounded-lg p-3 ${
                        request.maintenance_cost_paid_by === 'landlord' &&
                        Number(request.maintenance_cost || 0) > 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-50'
                      }`}
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500">Cost</p>
                      <p className="text-slate-900 font-medium">
                        {formatCurrency(request.maintenance_cost)}
                        {request.maintenance_cost_paid_by === 'landlord' ? ' · landlord' : ' · tenant'}
                      </p>
                      {request.maintenance_cost_notes && (
                        <p className="text-xs text-slate-500 mt-1">{request.maintenance_cost_notes}</p>
                      )}
                    </div>
                  </div>
                  {request.attachment_urls && request.attachment_urls.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {request.attachment_urls.map((url, idx) => (
                        <button
                          key={`${url}-${idx}`}
                          type="button"
                          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                          className="group relative overflow-hidden rounded-xl border bg-slate-50 hover:bg-slate-100 transition"
                        >
                          <img
                            src={url}
                            alt={`Maintenance attachment ${idx + 1}`}
                            className="h-28 w-full object-cover"
                          />
                          <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium">
                            View full size
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {request.assigned_to_name && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm">
                      <p className="font-semibold text-emerald-900">
                        Assigned technician: {request.assigned_to_name}
                        {request.assigned_technician_phone && ` • ${request.assigned_technician_phone}`}
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">
                        Expect a call or visit from the technician soon.
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle>Need help?</CardTitle>
            <CardDescription>Quick actions and support</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <Plus className="h-5 w-5 text-blue-600 mb-2" />
                <p className="font-medium mb-1">Report new issue</p>
                <p className="text-xs text-muted-foreground mb-3">Submit a maintenance request</p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <Link href="/dashboard/tenant/maintenance/new">Create request</Link>
                </Button>
              </div>
              <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <MessageSquare className="h-5 w-5 text-green-600 mb-2" />
                <p className="font-medium mb-1">Ask management</p>
                <p className="text-xs text-muted-foreground mb-3">Send a message to property team</p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <Link href="/dashboard/tenant/messages">Send message</Link>
                </Button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              For emergencies impacting safety, contact management immediately via phone.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
