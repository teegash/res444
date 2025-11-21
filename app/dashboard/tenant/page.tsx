'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TenantHeader } from '@/components/dashboard/tenant/tenant-header'
import { TenantInfoCards } from '@/components/dashboard/tenant/tenant-info-cards'
import { TenantQuickActions } from '@/components/dashboard/tenant/tenant-quick-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, TrendingUp, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

type TenantSummary = {
  profile: {
    full_name: string | null
    phone_number: string | null
    profile_picture_url: string | null
    address: string | null
  } | null
  lease: {
    id: string
    status: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    unit_number: string | null
    unit_label: string | null
    property_name: string | null
    property_location: string | null
    unit_price_text: string | null
    rent_paid_until?: string | null
  } | null
} | null

type TenantInvoiceRecord = {
  id: string
  amount: number
  due_date: string | null
  status: boolean
  invoice_type: string | null
  property_name: string | null
  property_location: string | null
  unit_label: string | null
  created_at?: string | null
} | null

type ActivityItem = {
  id: string
  title: string
  description: string
  dateLabel: string
  tone: 'success' | 'warning' | 'info' | 'danger'
  source: 'invoice' | 'maintenance'
}

export default function TenantDashboard() {
  const [summary, setSummary] = useState<TenantSummary>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingInvoices, setPendingInvoices] = useState<TenantInvoiceRecord[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/tenant/summary', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load tenant info.')
      }
      const payload = await response.json()
      setSummary(payload.data || null)
    } catch (err) {
      console.error('[TenantDashboard] summary fetch failed', err)
      setError(err instanceof Error ? err.message : 'Unable to load tenant info.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const fetchPendingInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/invoices?status=pending', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load pending invoices.')
      }
      const payload = await response.json()
      const list = (payload.data || []) as TenantInvoiceRecord[]
      const sorted = [...list].sort((a, b) => {
        const aTime = a?.due_date ? new Date(a.due_date).getTime() : 0
        const bTime = b?.due_date ? new Date(b.due_date).getTime() : 0
        return aTime - bTime
      })
      setPendingInvoices(sorted)
    } catch (err) {
      console.error('[TenantDashboard] pending invoice fetch failed', err)
      setPendingInvoices([])
    }
  }, [])

  useEffect(() => {
    fetchPendingInvoices()
  }, [fetchPendingInvoices])

  const fetchRecentActivity = useCallback(async () => {
    try {
      const [invoicesResp, maintenanceResp] = await Promise.all([
        fetch('/api/tenant/invoices', { cache: 'no-store' }),
        fetch('/api/tenant/maintenance/requests', { cache: 'no-store' }),
      ])

      const invoicePayload = invoicesResp.ok ? await invoicesResp.json().catch(() => ({})) : { data: [] }
      const maintenancePayload = maintenanceResp.ok ? await maintenanceResp.json().catch(() => ({})) : { data: [] }

      const invoices: TenantInvoiceRecord[] = invoicePayload.data || []
      const maintenanceRequests: Array<{
        id: string
        title: string
        status: string
        created_at?: string | null
        updated_at?: string | null
      }> = maintenancePayload.data || []

      const invoiceItems: ActivityItem[] = invoices
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 4)
        .map((invoice) => {
          const isPaid = Boolean(invoice?.status)
          const isWater = invoice?.invoice_type === 'water'
          const tone: ActivityItem['tone'] = isPaid ? 'success' : isWater ? 'info' : 'warning'
          const title = isPaid
            ? `${isWater ? 'Water bill' : 'Rent'} payment recorded`
          : `${isWater ? 'Water bill' : 'Rent'} invoice pending`
        const description = isPaid
          ? `${invoice?.property_name || 'Your unit'} • receipt available`
          : `Due ${invoice?.due_date ? new Date(invoice.due_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'soon'}`
        const dateSource = invoice?.created_at || invoice?.due_date
        const dateLabel = dateSource
          ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'

          return {
            id: invoice?.id || crypto.randomUUID(),
            title,
            description,
            dateLabel,
            tone,
            source: 'invoice',
          }
        })

      const maintenanceItems: ActivityItem[] = (maintenanceRequests || [])
        .sort((a, b) => {
          const aTime = a?.updated_at ? new Date(a.updated_at).getTime() : a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.updated_at ? new Date(b.updated_at).getTime() : b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 4)
        .map((request) => {
          const status = (request.status || '').toLowerCase()
          let tone: ActivityItem['tone'] = 'info'
          if (status.includes('resolved') || status.includes('completed')) {
            tone = 'success'
          } else if (status.includes('urgent') || status.includes('pending')) {
            tone = 'warning'
          }
          const dateSource = request.updated_at || request.created_at
          const dateLabel = dateSource
            ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'

          return {
            id: request.id,
            title: `Maintenance · ${request.title}`,
            description: `Status: ${request.status}`,
            dateLabel,
            tone,
            source: 'maintenance',
          }
        })

      const combined = [...invoiceItems, ...maintenanceItems]
        .sort((a, b) => {
          const aTime = Date.parse(a.dateLabel) || 0
          const bTime = Date.parse(b.dateLabel) || 0
          return bTime - aTime
        })
        .slice(0, 4)

      setRecentActivity(combined)
    } catch (error) {
      console.warn('[TenantDashboard] Failed to load recent activity', error)
    }
  }, [])

  useEffect(() => {
    fetchRecentActivity()
  }, [fetchRecentActivity])

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const nextInvoice = pendingInvoices[0] || null
  const hasPending = pendingInvoices.length > 0
  const rentPaidUntil = summary?.lease?.rent_paid_until || null

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-orange-50/20">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <TenantHeader summary={summary} onProfileUpdated={fetchSummary} loading={loading} />
        <TenantInfoCards summary={summary} loading={loading} />
        
        <div className="grid gap-6 md:grid-cols-3 mt-8">
          {/* Recent Activity */}
          <Card className="md:col-span-2 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Recent Activity
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-2" onClick={fetchRecentActivity}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivity.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No recent invoices or payments yet.
                </div>
              ) : (
                recentActivity.map((activity) => {
                  const badgeClass =
                    activity.tone === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : activity.tone === 'danger'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : activity.tone === 'info'
                          ? 'bg-blue-50 text-blue-700 border border-blue-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                  const iconBg =
                    activity.tone === 'success'
                      ? 'bg-emerald-100 text-emerald-600'
                      : activity.tone === 'danger'
                        ? 'bg-red-100 text-red-600'
                        : activity.tone === 'info'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-amber-100 text-amber-600'

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-100 shadow-sm"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg}`}>
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{activity.title}</p>
                          <span className="text-xs text-muted-foreground">{activity.dateLabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        <div className={`mt-2 inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full ${badgeClass}`}>
                          <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                          {activity.source === 'maintenance'
                            ? 'Maintenance Update'
                            : activity.tone === 'success'
                              ? 'Payment · Posted'
                              : activity.tone === 'danger'
                                ? 'Payment · Failed'
                                : activity.tone === 'info'
                                  ? 'Water Bill'
                                  : 'Rent Invoice'}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-600" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">Next Payment Due</p>
                  <Badge variant="destructive" className="text-xs">
                    {nextInvoice ? 'Due Soon' : 'Clear'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {nextInvoice ? formatDate(nextInvoice.due_date) : 'No outstanding payments'}
                </p>
                {rentPaidUntil && (
                  <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 mt-2">
                    Rent covered through <span className="font-semibold">{formatDate(rentPaidUntil)}</span>
                  </p>
                )}
                {hasPending ? (
                <div className="space-y-3 mt-3">
                  {pendingInvoices.slice(0, 3).map((invoice, index) => {
                    if (!invoice) return null
                    return (
                      <div key={invoice.id ?? index} className="p-3 rounded-lg bg-white border border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {invoice.invoice_type === 'water' ? 'Water Bill' : 'Invoice'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Due {formatDate(invoice.due_date)}
                            </p>
                          </div>
                          <p className="font-semibold text-lg">
                            {`KES ${invoice.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/tenant/payment?invoiceId=${invoice.id}&intent=${invoice.invoice_type || ''}`}
                          className="mt-3 block"
                        >
                          <Button size="sm" className="w-full" variant="outline">
                            Pay {invoice.invoice_type === 'water' ? 'Water Bill' : 'Invoice'}
                          </Button>
                        </Link>
                      </div>
                    )
                  })}
                </div>
                ) : (
                  <Button size="sm" className="w-full mt-2" variant="outline" disabled>
                    All Paid
                  </Button>
                )}
              </div>
              
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm font-medium mb-1">Lease Renewal</p>
                <p className="text-xs text-muted-foreground">Review due: March 1, 2025</p>
                <Link href="/dashboard/tenant/lease">
                  <Button size="sm" className="w-full mt-2" variant="outline">
                    View Lease
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <TenantQuickActions />

        {/* Quick Stats */}
        <Card className="bg-gradient-to-br from-blue-600 to-orange-500 text-white shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5" />
              <h3 className="text-lg font-bold">Your Rental Summary</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm opacity-90">Payments Made</p>
                <p className="text-2xl font-bold">12</p>
              </div>
              <div>
                <p className="text-sm opacity-90">On-time Rate</p>
                <p className="text-2xl font-bold">100%</p>
              </div>
              <div>
                <p className="text-sm opacity-90">Maintenance</p>
                <p className="text-2xl font-bold">3</p>
              </div>
              <div>
                <p className="text-sm opacity-90">Messages</p>
                <p className="text-2xl font-bold">8</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
