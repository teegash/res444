'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Eye,
  MessageSquare,
  UserPlus,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock3,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useToast } from '@/components/ui/use-toast'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'

type MaintenanceRequest = {
  id: string
  title: string
  description: string
  priority_level: string | null
  status: string | null
  created_at: string
  updated_at?: string | null
  completed_at?: string | null
  attachment_urls?: string[] | null
  tenant?: {
    id: string
    full_name: string | null
    phone_number: string | null
  } | null
  unit?: {
    id: string
    unit_number: string | null
    building?: {
      id: string
      name: string | null
      location: string | null
    } | null
  } | null
  assigned_to?: string | null
  assigned_to_name?: string | null
  assigned_technician_phone?: string | null
}

type DescriptionMetadata = {
  summary: string
  metadata: Record<string, string>
}

function extractDescriptionMeta(description: string | null | undefined): DescriptionMetadata {
  if (!description) {
    return { summary: 'No additional details provided.', metadata: {} }
  }

  const lines = description.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return { summary: 'No additional details provided.', metadata: {} }
  }

  const [summary, ...rest] = lines
  const metadataEntries = rest.reduce<Record<string, string>>((acc, line) => {
    const [label, ...valueParts] = line.split(':')
    if (valueParts.length > 0) {
      acc[label.toLowerCase()] = valueParts.join(':').trim()
    }
    return acc
  }, {})

  return { summary, metadata: metadataEntries }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function MaintenancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assignTechnicianName, setAssignTechnicianName] = useState('')
  const [assignTechnicianPhone, setAssignTechnicianPhone] = useState('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [completeSubmitting, setCompleteSubmitting] = useState(false)
  const { toast } = useToast()

  const openRequests = useMemo(() => requests.filter((r) => r.status === 'open').length, [requests])
  const inProgress = useMemo(
    () => requests.filter((r) => r.status === 'in_progress' || r.status === 'assigned').length,
    [requests]
  )
  const completedRequests = useMemo(
    () => requests.filter((r) => r.status === 'completed').length,
    [requests]
  )
  const averageResponse = useMemo(() => {
    const durations = requests
      .map((request) => {
        if (!request.completed_at || !request.created_at) return null
        const completed = new Date(request.completed_at).getTime()
        const created = new Date(request.created_at).getTime()
        if (Number.isNaN(completed) || Number.isNaN(created) || completed <= created) return null
        return (completed - created) / 3600000
      })
      .filter((value): value is number => value !== null)

    if (durations.length === 0) {
      return '—'
    }

    const avgHours = durations.reduce((sum, value) => sum + value, 0) / durations.length
    if (avgHours >= 24) {
      return `${(avgHours / 24).toFixed(1)} days`
    }
    return `${avgHours.toFixed(1)} hrs`
  }, [requests])
  const selectedMeta = selectedRequest ? extractDescriptionMeta(selectedRequest.description) : null
  const highlightedRequestId = searchParams?.get('requestId')
  const filteredRequests = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return requests.filter((request) => {
      const meta = extractDescriptionMeta(request.description)
      const categoryRaw = (meta.metadata.category || meta.metadata['category'] || 'general').toLowerCase()
      const statusRaw = (request.status || 'open').toLowerCase()
      const priorityRaw = (request.priority_level || 'medium').toLowerCase()

      if (search) {
        const haystack = [
          request.title,
          request.description,
          request.tenant?.full_name,
          request.unit?.unit_number,
          request.unit?.building?.name,
          meta.metadata.location,
          meta.metadata['specific location'],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(search)) {
          return false
        }
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          const activeStatuses = ['in_progress', 'assigned']
          if (!activeStatuses.includes(statusRaw)) {
            return false
          }
        } else if (statusRaw !== statusFilter) {
          return false
        }
      }

      if (priorityFilter !== 'all' && priorityRaw !== priorityFilter) {
        return false
      }

      if (categoryFilter !== 'all' && categoryRaw !== categoryFilter) {
        return false
      }

      return true
    })
  }, [requests, searchTerm, statusFilter, priorityFilter, categoryFilter])

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoadingRequests(true)
        setRequestError(null)
        const response = await fetch('/api/maintenance/requests', {
          cache: 'no-store',
          credentials: 'include',
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to load maintenance requests.')
        }
        const payload = await response.json()
        setRequests(payload.data || [])
      } catch (error) {
        console.error('[MaintenancePage] fetch failed', error)
        setRequestError(error instanceof Error ? error.message : 'Unable to load maintenance requests.')
      } finally {
        setLoadingRequests(false)
      }
    }

    fetchRequests()
  }, [])

  useEffect(() => {
    if (!highlightedRequestId || requests.length === 0) return
    const matched = requests.find((req) => req.id === highlightedRequestId) || null
    if (matched) {
      setSelectedRequest(matched)
      setDetailsModalOpen(true)
      const card = document.getElementById(`maintenance-card-${matched.id}`)
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
        card.classList.add('ring-2', 'ring-blue-400')
        setTimeout(() => card.classList.remove('ring-2', 'ring-blue-400'), 2000)
      }
    }
  }, [highlightedRequestId, requests])

  const handleAssignSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedRequest) {
      setAssignError('Select a maintenance request to assign.')
      return
    }
    if (!assignTechnicianName.trim() || !assignTechnicianPhone.trim()) {
      setAssignError('Technician name and phone number are required.')
      return
    }

    setAssignSubmitting(true)
    setAssignError(null)
    try {
      const response = await fetch('/api/maintenance/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          technicianName: assignTechnicianName,
          technicianPhone: assignTechnicianPhone,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to assign technician.')
      }

      const updated = payload.data as {
        id: string
        status: string | null
        assigned_technician_name?: string | null
        assigned_technician_phone?: string | null
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === updated.id
            ? {
                ...request,
                assigned_to_name: updated.assigned_technician_name || request.assigned_to_name,
                assigned_technician_phone:
                  updated.assigned_technician_phone || request.assigned_technician_phone || null,
                status: updated.status || request.status,
              }
            : request
        )
      )

      setSelectedRequest((current) =>
        current && current.id === updated.id
          ? {
              ...current,
              assigned_to_name: updated.assigned_technician_name || current.assigned_to_name,
              assigned_technician_phone:
                updated.assigned_technician_phone || current.assigned_technician_phone || null,
              status: updated.status || current.status,
            }
          : current
      )

      toast({
        title: 'Technician assigned',
        description: `${updated.assigned_technician_name || 'Technician'} has been notified.`,
      })
      setAssignModalOpen(false)
    } catch (error) {
      console.error('[MaintenancePage] assign failed', error)
      setAssignError(error instanceof Error ? error.message : 'Unable to assign technician.')
    } finally {
      setAssignSubmitting(false)
    }
  }

  const handleMarkComplete = async () => {
    if (!selectedRequest) {
      setAssignError('Select a maintenance request to update.')
      return
    }
    setAssignError(null)
    setCompleteSubmitting(true)
    try {
      const response = await fetch('/api/maintenance/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          requestId: selectedRequest.id,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to mark request as complete.')
      }

      const updated = payload.data as { id: string; status?: string | null; completed_at?: string | null }

      setRequests((current) =>
        current.map((request) =>
          request.id === updated.id
            ? {
                ...request,
                status: updated.status || 'completed',
                completed_at: updated.completed_at || request.completed_at,
              }
            : request
        )
      )

      setSelectedRequest((current) =>
        current && current.id === updated.id
          ? {
              ...current,
              status: updated.status || 'completed',
              completed_at: updated.completed_at || current.completed_at,
            }
          : current
      )

      toast({
        title: 'Request completed',
        description: 'The tenant has been notified.',
      })
    } catch (error) {
      console.error('[MaintenancePage] complete failed', error)
      setAssignError(error instanceof Error ? error.message : 'Unable to complete request.')
    } finally {
      setCompleteSubmitting(false)
    }
  }

  const metricCards = [
    {
      label: 'Open tickets',
      value: openRequests,
      meta: 'Require attention',
      icon: AlertTriangle,
      accent: 'bg-rose-50 text-rose-600',
    },
    {
      label: 'In progress',
      value: inProgress,
      meta: 'Technicians on site',
      icon: Activity,
      accent: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Completed requests',
      value: completedRequests,
      meta: 'Resolved & closed',
      icon: CheckCircle2,
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Avg. response',
      value: averageResponse,
      meta: 'Average resolution time',
      icon: Clock3,
      accent: 'bg-purple-50 text-purple-600',
    },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto bg-slate-50 pb-12">
          <section className="bg-gradient-to-r from-[#3f6fb1] via-[#5B9BD5] to-[#74b8f0] text-white">
            <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs tracking-wide uppercase">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    Maintenance hub
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold">Maintenance Operations Center</h1>
                    <p className="text-sm text-white/80 mt-1">
                      Monitor tenant issues, assign technicians, and keep response times low.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 space-y-8 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {metricCards.map((metric) => (
                <Card key={metric.label} className="border border-white/60 shadow-lg/5 bg-white">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className={`p-3 rounded-2xl ${metric.accent}`}>
                      <metric.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                      <p className="text-2xl font-semibold mt-1">{metric.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{metric.meta}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-none shadow-lg bg-white/90 backdrop-blur">
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Filter queue</h2>
                    <p className="text-xs text-muted-foreground">Refine by status, priority, or category</p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full text-xs">
                    Save view
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search requests..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold">Maintenance Requests</h2>
                  <p className="text-sm text-gray-600">All maintenance requests from tenants</p>
                </div>
                {loadingRequests && <p className="text-xs text-muted-foreground">Refreshing…</p>}
              </div>
              {requestError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {requestError}
                </div>
              ) : loadingRequests ? (
                <SkeletonTable rows={6} columns={5} />
              ) : (
                <div className="space-y-4">
                  {filteredRequests.length === 0 && !loadingRequests ? (
                    <div className="text-center text-muted-foreground py-10 border rounded-lg">
                      {requests.length === 0
                        ? 'No maintenance requests yet.'
                        : 'No requests match your current filters.'}
                    </div>
                  ) : (
                    filteredRequests.map((request) => {
                      const meta = extractDescriptionMeta(request.description)
                      const submittedAt = formatDate(request.created_at)
                    const tenantName = request.tenant?.full_name || 'Tenant'
                    const propertyLabel =
                      request.unit?.unit_number && request.unit?.building?.name
                        ? `${request.unit.unit_number} • ${request.unit.building.name}`
                        : request.unit?.unit_number || request.unit?.building?.name || 'Assigned unit'
                    const categoryValue = meta.metadata.category || meta.metadata['category'] || 'General'
                    const locationValue = meta.metadata.location || meta.metadata['specific location'] || 'Not specified'

                    return (
                  <Card
                    key={request.id}
                    id={`maintenance-card-${request.id}`}
                    className="relative border border-slate-100 bg-white shadow-sm hover:shadow-lg transition-all"
                  >
                    <span
                      className={`absolute left-0 top-0 h-full w-1 rounded-r-full ${
                        request.status === 'open'
                          ? 'bg-blue-400'
                          : request.status === 'in_progress' || request.status === 'assigned'
                            ? 'bg-amber-400'
                            : request.status === 'completed'
                              ? 'bg-emerald-400'
                              : 'bg-slate-300'
                      }`}
                    />
                    <CardContent className="p-5 pl-7 space-y-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="font-semibold text-lg text-slate-900">{request.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {tenantName} &middot; {propertyLabel}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">Submitted {submittedAt}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={
                              request.priority_level === 'high'
                                ? 'bg-red-100 text-red-700'
                                : request.priority_level === 'medium'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : request.priority_level === 'urgent'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                            }
                          >
                            {request.priority_level || 'medium'}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={
                              request.status === 'open'
                                ? 'bg-blue-100 text-blue-700'
                                : request.status === 'in_progress' || request.status === 'assigned'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }
                          >
                            {(request.status || 'open').replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
                          <p className="font-medium text-slate-900">{categoryValue}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
                          <p className="font-medium text-slate-900">{locationValue}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Assigned to</p>
                          <div className="font-medium text-slate-900">
                            {request.assigned_to_name || 'Unassigned'}
                            {request.assigned_to_name && request.assigned_technician_phone && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {request.assigned_technician_phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            setSelectedRequest(request)
                            setDetailsModalOpen(true)
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            if (!request.tenant?.id) return
                            router.push(
                              `/dashboard/tenants/${request.tenant.id}/messages?tenantId=${request.tenant.id}`
                            )
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Message tenant
                        </Button>
                        {(!request.assigned_to_name || request.assigned_to_name === 'Unassigned') && (
                          <Button
                            size="sm"
                            className="rounded-full bg-amber-500 hover:bg-amber-600"
                            onClick={() => {
                              setSelectedRequest(request)
                              setAssignTechnicianName('')
                              setAssignTechnicianPhone('')
                              setAssignError(null)
                              setAssignModalOpen(true)
                            }}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Assign technician
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                    )})
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>Complete information about the maintenance request</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-lg font-bold">{selectedRequest.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Tenant</Label>
                  <p>{selectedRequest.tenant?.full_name || 'Tenant'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Property</Label>
                  <p>{selectedRequest.unit?.building?.name || 'Assigned property'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Unit</Label>
                  <p>{selectedRequest.unit?.unit_number || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Category</Label>
                  <p>{selectedMeta?.metadata.category || 'General'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Priority</Label>
                  <Badge variant="secondary">{selectedRequest.priority_level || 'medium'}</Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge variant="secondary">{(selectedRequest.status || 'open').replace('_', ' ')}</Badge>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedMeta?.summary || selectedRequest.description || 'No additional details provided.'}
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  {selectedMeta?.metadata.location && (
                    <p>
                      <span className="font-medium text-foreground">Location:</span> {selectedMeta.metadata.location}
                    </p>
                  )}
                  {selectedMeta?.metadata['preferred contact'] && (
                    <p>
                      <span className="font-medium text-foreground">Contact:</span>{' '}
                      {selectedMeta.metadata['preferred contact']}
                    </p>
                  )}
                  {selectedMeta?.metadata.availability && (
                    <p>
                      <span className="font-medium text-foreground">Availability:</span>{' '}
                      {selectedMeta.metadata.availability}
                    </p>
                  )}
                </div>
              </div>
              {selectedRequest.attachment_urls && selectedRequest.attachment_urls.length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Attached photos</Label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedRequest.attachment_urls.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        className="group relative overflow-hidden rounded-xl border bg-slate-50 hover:bg-slate-100 transition"
                      >
                        <img
                          src={url}
                          alt={`Maintenance attachment ${index + 1}`}
                          className="h-28 w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium">
                          View full size
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedRequest.assigned_to_name && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">
                    Assigned technician: {selectedRequest.assigned_to_name}
                  </p>
                  {selectedRequest.assigned_technician_phone && (
                    <p className="text-xs text-emerald-800 mt-1">
                      Contact: {selectedRequest.assigned_technician_phone}
                    </p>
                  )}
                  <p className="text-xs text-emerald-700 mt-1">
                    Tenant has been notified about this assignment.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleMarkComplete}
                  disabled={
                    !selectedRequest || selectedRequest.status === 'completed' || completeSubmitting
                  }
                >
                  {completeSubmitting ? 'Marking…' : 'Mark as Complete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignModalOpen}
        onOpenChange={(open) => {
          setAssignModalOpen(open)
          if (!open) {
            setAssignError(null)
            setAssignTechnicianName('')
            setAssignTechnicianPhone('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Technician</DialogTitle>
            <DialogDescription>Share the contact details with the tenant and update the request</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAssignSubmit}>
            <div>
              <Label htmlFor="technician-name">Technician name</Label>
              <Input
                id="technician-name"
                placeholder="e.g. Peter Mwangi"
                value={assignTechnicianName}
                onChange={(event) => setAssignTechnicianName(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="technician-phone">Technician phone</Label>
              <Input
                id="technician-phone"
                placeholder="e.g. +2547..."
                value={assignTechnicianPhone}
                onChange={(event) => setAssignTechnicianPhone(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Provide the number the tenant should expect a call from.</p>
            </div>
            {assignError && <p className="text-sm text-red-600">{assignError}</p>}
            <Button type="submit" className="w-full" disabled={assignSubmitting || !selectedRequest}>
              {assignSubmitting ? 'Assigning…' : 'Assign Request'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </div>
)
}
