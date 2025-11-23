'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { AlertTriangle, Loader2, Plus, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

type TenantOption = {
  id: string
  name: string
  property?: string | null
  buildingId?: string | null
}

type NoticeLog = {
  id: string
  recipientId: string | null
  recipientName: string
  message: string
  channel: string | null
  created_at: string | null
}

const templates = [
  {
    title: 'Rent Reminder',
    message: 'Hello, this is a friendly reminder that your rent is due. Kindly clear your balance to avoid penalties.',
    notice_type: 'payment',
  },
  {
    title: 'Maintenance Notice',
    message: 'We will perform maintenance in your building tomorrow between 9:00 AM and 2:00 PM. Please plan accordingly.',
    notice_type: 'maintenance',
  },
  {
    title: 'Policy Update',
    message: 'We have updated our house rules. Kindly review the new policy in the tenant portal.',
    notice_type: 'policy',
  },
]

export default function ManagerNoticesPage() {
  const { toast } = useToast()
  const [noticeType, setNoticeType] = useState<string>('general')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendSms, setSendSms] = useState(false)
  const [sendApp, setSendApp] = useState(true)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  const [noticesLoading, setNoticesLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [sendAll, setSendAll] = useState(true)
  const [recentNotices, setRecentNotices] = useState<NoticeLog[]>([])
  const [stats, setStats] = useState<{ recipients: number; sms_sent?: number; email_sent?: number } | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  const filteredTenants = useMemo(() => {
    const term = search.trim().toLowerCase()
    const [propertyId] = propertyFilter === 'all' ? ['all'] : propertyFilter.split(':::')
    const byProperty =
      propertyFilter === 'all'
        ? tenants
        : tenants.filter((tenant) => tenant.buildingId === propertyId)
    if (!term) return byProperty
    return byProperty.filter((tenant) =>
      [tenant.name, tenant.property].some((value) => value?.toLowerCase().includes(term))
    )
  }, [search, tenants, propertyFilter])

  const propertyOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        tenants
          .map((t) => (t.buildingId ? `${t.buildingId}:::${t.property || 'Property'}` : t.property || ''))
          .filter((p): p is string => Boolean(p))
      )
    )
    return values
  }, [tenants])

  const toggleTenant = (id: string, checked: boolean) => {
    setSendAll(false)
    setSelectedTenants((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id]
      }
      return current.filter((tenantId) => tenantId !== id)
    })
  }

  const fetchTenants = async () => {
    try {
      setTenantsLoading(true)
      const response = await fetch('/api/tenants', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load tenants.')
      }
      const options =
        (payload.data || []).map((tenant: any) => ({
          id: tenant.id,
          name: tenant.full_name || tenant.profile?.full_name || 'Tenant',
          property:
            tenant.unit?.building_name ||
            tenant.unit?.unit_number ||
            tenant.unit_label ||
            null,
          buildingId: tenant.unit?.building_id || null,
        })) || []
      setTenants(options)
    } catch (error) {
      console.error('[Notices] Failed to load tenants', error)
      toast({
        title: 'Unable to load tenants',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setTenantsLoading(false)
    }
  }

  const fetchRecentNotices = async () => {
    try {
      setNoticesLoading(true)
      const response = await fetch('/api/manager/notices', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load notices.')
      }
      setRecentNotices(payload.data || [])
    } catch (error) {
      console.error('[Notices] Failed to load recent notices', error)
    } finally {
      setNoticesLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
    fetchRecentNotices()
  }, [])

  const resetForm = () => {
    setSendSuccess(false)
    setStats(null)
    setTitle('')
    setMessage('')
    setSelectedTenants([])
    setSendAll(true)
    setNoticeType('general')
    setPropertyFilter('all')
  }

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a notice message.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSending(true)
      const response = await fetch('/api/manager/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_ids: selectedTenants,
          send_all: sendAll,
          title,
          message,
          notice_type: noticeType,
          channels: {
            email: sendEmail,
            sms: sendSms,
            in_app: sendApp,
          },
          property_id: propertyFilter === 'all' ? null : propertyFilter.split(':::')[0] || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send notice.')
      }
      setStats(payload.data || null)
      setSendSuccess(true)
      toast({
        title: 'Notice sent',
        description: `Sent to ${payload.data?.recipients || 0} tenants.`,
      })
      setSelectedTenants([])
      setSendAll(true)
      setTitle('')
      setMessage('')
      fetchRecentNotices()
    } catch (error) {
      toast({
        title: 'Unable to send notice',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          {sendSuccess ? (
            <div className="max-w-4xl mx-auto">
              <Card className="p-8 shadow-xl bg-white/90 backdrop-blur">
                <div className="flex items-center justify-between mb-6">
                  <Button variant="ghost" onClick={resetForm}>
                    ← Back
                  </Button>
                  <Badge variant="secondary" className="text-sm">Notice sent</Badge>
                </div>
                <div className="space-y-3 text-center">
                  <h2 className="text-2xl font-bold">Notice sent successfully</h2>
                  <p className="text-muted-foreground">
                    Delivered to {stats?.recipients || 0} tenants
                    {stats?.sms_sent !== undefined ? ` • SMS: ${stats.sms_sent || 0}` : ''}
                    {stats?.email_sent !== undefined ? ` • Email: ${stats.email_sent || 0}` : ''}
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <Button onClick={resetForm}>Send another notice</Button>
                    <Button variant="outline" onClick={resetForm}>
                      Back to notices
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
          <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 border border-blue-200 shadow-sm">
                <AlertTriangle className="h-6 w-6 text-blue-700" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Send Notice</h1>
                <p className="text-sm text-muted-foreground">
                  Notify tenants via in-app, SMS, and email from one place.
                </p>
              </div>
            </div>
            {stats ? (
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/80 border shadow-sm">
                <Badge variant="outline">Recipients: {stats.recipients}</Badge>
                {stats.sms_sent !== undefined && <Badge variant="secondary">SMS: {stats.sms_sent}</Badge>}
                {stats.email_sent !== undefined && <Badge variant="secondary">Email: {stats.email_sent}</Badge>}
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2 border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <CardTitle>Compose notice</CardTitle>
                </div>
                <CardDescription>Pick recipients, choose channels, and send instantly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="notice-type">Notice Type</Label>
                    <Select value={noticeType} onValueChange={setNoticeType}>
                      <SelectTrigger id="notice-type">
                        <SelectValue placeholder="Select notice type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Announcement</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="payment">Payment Reminder</SelectItem>
                        <SelectItem value="policy">Policy Update</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Notice Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g. Water maintenance tomorrow"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Enter your notice message..."
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label>Delivery channels</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="send-app" checked={sendApp} onCheckedChange={(checked) => setSendApp(Boolean(checked))} />
                        <Label htmlFor="send-app" className="cursor-pointer">
                          In-app notification
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="send-email" checked={sendEmail} onCheckedChange={(checked) => setSendEmail(Boolean(checked))} />
                        <Label htmlFor="send-email" className="cursor-pointer">
                          Email
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="send-sms" checked={sendSms} onCheckedChange={(checked) => setSendSms(Boolean(checked))} />
                        <Label htmlFor="send-sms" className="cursor-pointer">
                          SMS
                        </Label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose one or more channels. SMS and Email depend on tenant contact details.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Recipients</Label>
                    <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="all-tenants"
                          checked={sendAll}
                          onCheckedChange={(checked) => {
                            setSendAll(Boolean(checked))
                            if (checked) {
                              setSelectedTenants([])
                            }
                          }}
                        />
                        <Label htmlFor="all-tenants" className="cursor-pointer font-medium">
                          All tenants
                        </Label>
                      </div>
                      {!sendAll && (
                        <Badge variant="outline" className="text-xs">
                          {selectedTenants.length} selected
                        </Badge>
                      )}
                    </div>
                    <Input
                      placeholder="Search tenant or property"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All properties</SelectItem>
                        {propertyOptions.map((property) => {
                          const [id, name] = property.split(':::')
                          return (
                            <SelectItem key={property} value={property}>
                              {name || property}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                      {tenantsLoading ? (
                        <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading tenants…
                        </div>
                      ) : filteredTenants.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No tenants found.</div>
                      ) : (
                        filteredTenants.map((tenant) => (
                          <label
                            key={tenant.id}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <Checkbox
                              checked={sendAll || selectedTenants.includes(tenant.id)}
                              onCheckedChange={(checked) => toggleTenant(tenant.id, Boolean(checked))}
                              disabled={sendAll}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.property || 'No unit linked'}</p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <Button
                      key={template.title}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTitle(template.title)
                        setMessage(template.message)
                        setNoticeType(template.notice_type)
                      }}
                    >
                      <Plus className="h-3 w-3 mr-2" />
                      Use {template.title}
                    </Button>
                  ))}
                </div>

                <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Send Notice
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur h-full">
              <CardHeader>
                <CardTitle>Recent notices</CardTitle>
                <CardDescription>Last messages you sent</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {noticesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading notices…
                  </div>
                ) : recentNotices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notices sent yet.</p>
                ) : (
                  recentNotices.map((notice) => (
                    <div
                      key={notice.id}
                      className="p-4 rounded-lg border bg-gradient-to-r from-slate-50 to-white shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{notice.recipientName}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {notice.message}
                          </p>
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {notice.channel || 'notice'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {notice.created_at
                          ? new Date(notice.created_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
              <CardContent className="pt-0">
                <div className="border rounded-xl bg-slate-900 text-white p-4 shadow-inner">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-amber-300" />
                    <p className="font-semibold">Pro tip</p>
                  </div>
                  <p className="text-sm text-slate-100">
                    Blend channels for critical notices and keep messages short for SMS. Use property filters to stay precise.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  )
}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                      {tenantsLoading ? (
                        <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading tenants…
                        </div>
                      ) : filteredTenants.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No tenants found.</div>
                      ) : (
                        filteredTenants.map((tenant) => (
                          <label
                            key={tenant.id}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <Checkbox
                              checked={sendAll || selectedTenants.includes(tenant.id)}
                              onCheckedChange={(checked) => toggleTenant(tenant.id, Boolean(checked))}
                              disabled={sendAll}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.property || 'No unit linked'}</p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <Button
                      key={template.title}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTitle(template.title)
                        setMessage(template.message)
                        setNoticeType(template.notice_type)
                      }}
                    >
                      <Plus className="h-3 w-3 mr-2" />
                      Use {template.title}
                    </Button>
                  ))}
                </div>

                <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Send Notice
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur h-full">
                <CardHeader>
                  <CardTitle>Recent notices</CardTitle>
                  <CardDescription>Last messages you sent</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {noticesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading notices…
                    </div>
                  ) : recentNotices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notices sent yet.</p>
                  ) : (
                    recentNotices.map((notice) => (
                      <div
                        key={notice.id}
                        className="p-4 rounded-lg border bg-gradient-to-r from-slate-50 to-white shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{notice.recipientName}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {notice.message}
                            </p>
                          </div>
                          <Badge variant="secondary" className="capitalize">
                            {notice.channel || 'notice'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {notice.created_at
                            ? new Date(notice.created_at).toLocaleString()
                            : '—'}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-slate-900 text-white overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-300" />
                    Pro tip
                  </CardTitle>
                  <CardDescription className="text-slate-200">
                    Blend channels for critical notices and keep messages short for SMS.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-slate-100">
                    - Use templates to save time and stay consistent.<br />
                    - Include dates and actions up front.<br />
                    - SMS is best for urgent items; email for detail.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  )
}
