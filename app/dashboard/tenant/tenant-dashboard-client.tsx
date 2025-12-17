'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TenantHeader } from '@/components/dashboard/tenant/tenant-header'
import { TenantInfoCards } from '@/components/dashboard/tenant/tenant-info-cards'
import { TenantQuickActions } from '@/components/dashboard/tenant/tenant-quick-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, TrendingUp, Clock, CheckCircle2, Droplet } from 'lucide-react'
import Link from 'next/link'
import { SkeletonLoader, SkeletonPropertyCard, SkeletonTable } from '@/components/ui/skeletons'

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
  raw_status?: string | null
  is_covered?: boolean
  is_prestart?: boolean
} | null

type TenantPaymentActivity = {
  id: string
  invoice_id: string | null
  amount_paid: number
  payment_method: string | null
  status: string
  posted_at: string | null
  created_at: string | null
  invoice_type: string | null
  payment_type: string | null
  property_name: string | null
  unit_label: string | null
  raw_status?: string | null
  is_covered?: boolean
}

type ActivityItem = {
  id: string
  title: string
  description: string
  dateLabel: string
  tone: 'success' | 'warning' | 'info' | 'danger' | 'rent' | 'water' | 'maintenance'
  source: 'invoice' | 'maintenance' | 'payment'
  tagLabel: string
  timestamp: number
  href: string
}

export default function TenantDashboardClient() {
  const [summary, setSummary] = useState<TenantSummary>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingInvoices, setPendingInvoices] = useState<TenantInvoiceRecord[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [tenantPayments, setTenantPayments] = useState<TenantPaymentActivity[]>([])
  const [maintenanceCount, setMaintenanceCount] = useState<number>(0)
  const [arrears, setArrears] = useState<{ total: number; oldest_due_date: string | null }>({
    total: 0,
    oldest_due_date: null,
  })

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

  const fetchArrears = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/arrears', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok && json.success) {
        setArrears({
          total: Number(json.data?.arrears_amount || 0),
          oldest_due_date: json.data?.oldest_due_date || null,
        })
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchSummary()
    fetchArrears()
  }, [fetchSummary, fetchArrears])

  const fetchPendingInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/invoices?status=pending', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load pending invoices.')
      }
      const payload = await response.json()
      const list = ((payload.data || []) as TenantInvoiceRecord[]).filter((inv) => {
        if (!inv) return false
        const covered = Boolean(inv.is_covered)
        const prestart = Boolean(inv.is_prestart)
        const paid = Boolean(inv.status)
        return !covered && !prestart && !paid
      })
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

  const fetchRecentActivity = useCallback(async () => {
    try {
      const [invoicesResp, maintenanceResp, paymentsResp] = await Promise.all([
        fetch('/api/tenant/invoices', { cache: 'no-store' }),
        fetch('/api/tenant/maintenance/requests', { cache: 'no-store' }),
        fetch('/api/tenant/payments', { cache: 'no-store' }),
      ])

      const invoicePayload = invoicesResp.ok ? await invoicesResp.json().catch(() => ({})) : { data: [] }
      const maintenancePayload = maintenanceResp.ok ? await maintenanceResp.json().catch(() => ({})) : { data: [] }
      const paymentsPayload = paymentsResp.ok ? await paymentsResp.json().catch(() => ({})) : { data: [] }

      const invoices: TenantInvoiceRecord[] = invoicePayload.data || []
      const maintenanceRequests: Array<{
        id: string
        title: string
        status: string
        created_at?: string | null
        updated_at?: string | null
      }> = maintenancePayload.data || []
      const payments: TenantPaymentActivity[] = paymentsPayload.data || []

      const verifiedPayments = (payments || []).filter(
        (payment) => (payment.status || '').toLowerCase() === 'verified'
      )
      const pendingDeposits = (payments || []).filter(
        (payment) =>
          (payment.status || '').toLowerCase() === 'pending' &&
          (payment.payment_method || '').toLowerCase() === 'bank_transfer'
      )

      const paidInvoiceIds = new Set(
        verifiedPayments.map((payment) => payment.invoice_id).filter((id): id is string => Boolean(id))
      )

      const invoiceItems: ActivityItem[] = invoices
        .filter(Boolean)
        .filter((invoice) => {
          if (!invoice) return false
          const covered = Boolean(invoice.is_covered)
          const prestart = Boolean(invoice.is_prestart)
          const paid = Boolean(invoice.status)
          return !covered && !prestart && !paid && !paidInvoiceIds.has(invoice.id || '')
        })
        .sort((a, b) => {
          const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 4)
        .map((invoice) => {
          const isWater = invoice?.invoice_type === 'water'
          const tone: ActivityItem['tone'] = isWater ? 'water' : 'rent'
          const title = `${isWater ? 'Water bill' : 'Rent'} invoice pending`
          const description = `Due ${
            invoice?.due_date
              ? new Date(invoice.due_date).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                })
              : 'soon'
          }`
          const dateSource = invoice?.created_at || invoice?.due_date
          const dateLabel = dateSource
            ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'

          const timestamp = dateSource ? new Date(dateSource).getTime() : Date.now()
          const invoiceHref = invoice?.id ? `/dashboard/tenant/payment?invoiceId=${invoice.id}` : '/dashboard/tenant/payment'
          return {
            id: invoice?.id || crypto.randomUUID(),
            title,
            description,
            dateLabel,
            tone,
            source: 'invoice',
            tagLabel: isWater ? 'Water Bill' : 'Rent Invoice',
            timestamp,
            href: invoiceHref,
          }
        })

      const depositItems: ActivityItem[] = pendingDeposits
        .sort((a, b) => {
          const aTime = a?.posted_at ? new Date(a.posted_at).getTime() : a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.posted_at ? new Date(b.posted_at).getTime() : b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 2)
        .map((payment) => {
          const postedAt = payment.posted_at || payment.created_at
          const dateLabel = postedAt
            ? new Date(postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'
          const timestamp = postedAt ? new Date(postedAt).getTime() : Date.now()
          const amountLabel = `KES ${Number(payment.amount_paid || 0).toLocaleString()}`
          return {
            id: `deposit-${payment.id}`,
            title: 'Rent deposit slip submitted',
            description: `${amountLabel} • awaiting verification`,
            dateLabel,
            tone: 'rent',
            source: 'payment',
            tagLabel: 'Pending Verification',
            timestamp,
            href: '/dashboard/tenant/payments',
          }
        })

      const paymentItems: ActivityItem[] = verifiedPayments
        .sort((a, b) => {
          const aTime = a?.posted_at ? new Date(a.posted_at).getTime() : a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.posted_at ? new Date(b.posted_at).getTime() : b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 4)
        .map((payment) => {
          const type = (payment.invoice_type || payment.payment_type || 'rent').toLowerCase()
          const isWater = type === 'water'
          const tone: ActivityItem['tone'] = isWater ? 'water' : 'rent'
          const postedAt = payment.posted_at || payment.created_at
          const dateLabel = postedAt
            ? new Date(postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'
          const timestamp = postedAt ? new Date(postedAt).getTime() : Date.now()
          const amountLabel = `KES ${Number(payment.amount_paid || 0).toLocaleString()}`
          const methodLabel = (payment.payment_method || 'M-Pesa').replace('_', ' ')

          return {
            id: `payment-${payment.id}`,
            title: `${isWater ? 'Water bill' : 'Rent'} payment successful`,
            description: `${amountLabel} • via ${methodLabel}`,
            dateLabel,
            tone,
            source: 'payment',
            tagLabel: `${isWater ? 'Water' : 'Rent'} Payment`,
            timestamp,
            href: '/dashboard/tenant/payments',
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
          const tone: ActivityItem['tone'] = 'maintenance'
          const dateSource = request.updated_at || request.created_at
          const dateLabel = dateSource
            ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'
          const timestamp = dateSource ? new Date(dateSource).getTime() : Date.now()
          const statusLabel = status ? status.replace(/_/g, ' ') : 'Update posted'

          return {
            id: request.id,
            title: `Maintenance · ${request.title}`,
            description: `Status: ${statusLabel}`,
            dateLabel,
            tone,
            source: 'maintenance',
            tagLabel: `Maintenance · ${statusLabel}`,
            timestamp,
            href: '/dashboard/tenant/maintenance',
          }
        })

      const combined = [...depositItems, ...paymentItems, ...invoiceItems, ...maintenanceItems]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 6)

      setRecentActivity(combined)
      setTenantPayments(payments)
      setMaintenanceCount(maintenanceRequests.length)
    } catch (error) {
      console.warn('[TenantDashboard] Failed to load recent activity', error)
      setTenantPayments([])
      setMaintenanceCount(0)
    }
  }, [])

  useEffect(() => {
    fetchPendingInvoices()
    fetchRecentActivity()
  }, [fetchPendingInvoices, fetchRecentActivity])

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const nextInvoice = pendingInvoices[0] || null
  const hasPending = pendingInvoices.length > 0
  const rentPaidUntil = summary?.lease?.rent_paid_until || null

  const paymentsMade = tenantPayments.length
  const onTimeRate = useMemo(() => {
    if (!tenantPayments.length) return 0
    let onTime = 0
    tenantPayments.forEach((payment) => {
      const p: any = payment as any
      const due = p?.due_date ? new Date(p.due_date) : p?.invoices?.due_date ? new Date(p.invoices.due_date) : null
      const paid = p?.posted_at ? new Date(p.posted_at) : p?.payment_date ? new Date(p.payment_date) : p?.created_at ? new Date(p.created_at) : null
      if (due && paid && paid.getTime() <= due.getTime()) {
        onTime += 1
      }
    })
    return Math.round((onTime / tenantPayments.length) * 100)
  }, [tenantPayments])

  const ratingDot = useMemo(() => {
    if (onTimeRate >= 95) return 'bg-green-500'
    if (onTimeRate >= 87) return 'bg-yellow-400'
    if (onTimeRate >= 80) return 'bg-orange-500'
    return 'bg-red-500'
  }, [onTimeRate])

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

        <Card className="shadow-sm">
          <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Your arrears</p>
              <p className="text-xs text-gray-500">
                Oldest due date: {arrears.oldest_due_date ? new Date(arrears.oldest_due_date).toLocaleDateString() : '—'}
              </p>
            </div>
            {arrears.total > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Badge variant="destructive" className="text-base py-1 px-3">
                  Outstanding: KES {arrears.total.toLocaleString()}
                </Badge>
                <Link href="/dashboard/tenant/invoices?status=unpaid">
                  <Button>View invoices</Button>
                </Link>
              </div>
            ) : (
              <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
                You have no rent arrears.
              </Badge>
            )}
          </CardContent>
        </Card>
        
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
              {loading ? (
                <SkeletonTable rows={4} columns={3} />
              ) : recentActivity.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No recent invoices, payments, or maintenance updates yet.
                </div>
              ) : (
                recentActivity.map((activity) => {
                  const tone = activity.tone
                  const icon =
                    tone === 'maintenance'
                      ? <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      : tone === 'water'
                      ? <Droplet className="h-4 w-4 text-blue-500" />
                      : tone === 'rent'
                      ? <TrendingUp className="h-4 w-4 text-green-600" />
                      : <Clock className="h-4 w-4 text-slate-500" />

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3 hover:bg-slate-50 transition"
                    >
                      <div className="flex gap-3">
                        <div className="mt-1">{icon}</div>
                        <div>
                          <p className="font-semibold text-gray-900">{activity.title}</p>
                          <p className="text-xs text-gray-500">{activity.description}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span>{activity.dateLabel}</span>
                            <span>•</span>
                            <span className="capitalize">{activity.tagLabel}</span>
                          </div>
                        </div>
                      </div>
                      <Link href={activity.href}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Quick actions / stats */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-600" />
                Next Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Next rent invoice</p>
                <Badge variant={hasPending ? 'destructive' : 'secondary'}>
                  {hasPending ? 'Pending' : 'Clear'}
                </Badge>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {hasPending ? `${pendingInvoices[0]?.amount?.toLocaleString('en-KE', { maximumFractionDigits: 0 })} KES` : '—'}
              </div>
              <div className="text-sm text-gray-500">
                Due:{' '}
                {hasPending && pendingInvoices[0]?.due_date
                  ? new Date(pendingInvoices[0]?.due_date || '').toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'No pending invoices'}
              </div>
              <Button asChild className="w-full">
                <Link href="/dashboard/tenant/payments">View payments</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* On-time performance */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Payment Performance
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {paymentsMade} payments recorded
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${ratingDot}`} aria-hidden />
              <span className="text-sm text-gray-700">{onTimeRate}% on time</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">On-time payments</p>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600"
                    style={{ width: `${Math.min(onTimeRate, 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Upcoming payments</p>
                <p className="text-sm text-gray-700">
                  {hasPending ? 'Pending invoices detected in your account.' : 'No pending invoices right now.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <TenantQuickActions />
      </div>
    </div>
  )
}
