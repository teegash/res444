'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

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
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [requestError, setRequestError] = useState<string | null>(null)

  const openRequests = useMemo(() => requests.filter((r) => r.status === 'open').length, [requests])
  const inProgress = useMemo(
    () => requests.filter((r) => r.status === 'in_progress' || r.status === 'assigned').length,
    [requests]
  )
  const completedToday = useMemo(
    () => requests.filter((r) => r.status === 'completed').length,
    [requests]
  )
  const averageResponse = '2.5 hrs'

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoadingRequests(true)
        setRequestError(null)
        const response = await fetch('/api/maintenance/requests', { cache: 'no-store' })
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
      label: 'Completed today',
      value: completedToday,
      meta: 'Resolved & closed',
      icon: CheckCircle2,
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Avg. response',
      value: averageResponse,
      meta: 'Across all tickets',
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
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-white/70">Tenant satisfaction</p>
                    <p className="text-2xl font-semibold">98%</p>
                  </div>
                  <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                    <p className="text-white/70">Urgent SLAs</p>
                    <p className="text-2xl font-semibold">92% met</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 space-y-8 mt-[-3rem]">
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
                    <Input placeholder="Search requests..." className="pl-10" />
                  </div>
                  <Select>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
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
              ) : (
                <div className="space-y-4">
                  {requests.length === 0 && !loadingRequests ? (
                    <div className="text-center text-muted-foreground py-10 border rounded-lg">
                      No maintenance requests yet.
                    </div>
                  ) : (
                    requests.map((request) => {
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
                          <p className="font-medium text-slate-900">{request.assigned_to_name || 'Unassigned'}</p>
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
                        <Button variant="outline" size="sm" className="rounded-full">
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Message tenant
                        </Button>
                        {(!request.assigned_to_name || request.assigned_to_name === 'Unassigned') && (
                          <Button
                            size="sm"
                            className="rounded-full bg-amber-500 hover:bg-amber-600"
                            onClick={() => {
                              setSelectedRequest(request)
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
                    ))
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
              <div className="flex gap-2">
                <Button className="flex-1">Mark as Complete</Button>
                <Button variant="outline" className="flex-1">Add Note</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Technician</DialogTitle>
            <DialogDescription>Select a technician for this maintenance request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Technician</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peter">Peter Mwangi - Plumber</SelectItem>
                  <SelectItem value="james">James Ochieng - Electrician</SelectItem>
                  <SelectItem value="mary">Mary Wanjiru - General Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea placeholder="Add any special instructions..." />
            </div>
            <Button className="w-full">Assign Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </div>
)
}
  const selectedMeta = selectedRequest ? extractDescriptionMeta(selectedRequest.description) : null
