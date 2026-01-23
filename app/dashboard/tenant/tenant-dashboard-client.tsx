'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TenantInfoCards } from '@/components/dashboard/tenant/tenant-info-cards'
import { TenantQuickActions } from '@/components/dashboard/tenant/tenant-quick-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, TrendingUp, Clock, CheckCircle2, Droplet, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { SkeletonLoader, SkeletonPropertyCard, SkeletonTable } from '@/components/ui/skeletons'
import { AiGlowButton } from '@/components/ui/AiGlowButton'
import styles from '@/components/ui/AiGlowButton.module.css'

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
      property_image_url?: string | null
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
  const [recentActivityRefreshing, setRecentActivityRefreshing] = useState(false)
  const [arrears, setArrears] = useState<{ total: number; oldest_due_date: string | null }>({
    total: 0,
    oldest_due_date: null,
  })
  const leaseExpired = useMemo(() => {
    const endDate = summary?.lease?.end_date
    if (!endDate) return false
    const parsed = new Date(endDate)
    if (Number.isNaN(parsed.getTime())) return false
    const today = new Date()
    const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return currentDay > endDay
  }, [summary?.lease?.end_date])

  const hasAssignedUnit = useMemo(() => {
    if (!summary?.lease) return false
    const unitLabel = (summary.lease.unit_label || '').toLowerCase()
    const unitNumber = (summary.lease.unit_number || '').toLowerCase()
    if (!unitNumber && (!unitLabel || unitLabel.includes('unassigned'))) return false
    return true
  }, [summary?.lease])

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

      const toMs = (iso: string | null | undefined) => {
        if (!iso) return 0
        const d = new Date(iso)
        if (!Number.isNaN(d.getTime())) return d.getTime()
        // Handles YYYY-MM-DD (from due_date) reliably as UTC
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00.000Z`).getTime()
        return 0
      }

      const verifiedPayments = (payments || []).filter(
        (payment) => (payment.status || '').toLowerCase() === 'verified'
      )

      const pendingDeposits = (payments || []).filter(
        (payment) =>
          (payment.status || '').toLowerCase() === 'pending' &&
          (payment.payment_method || '').toLowerCase() === 'bank_transfer'
      )
      const paymentTimestamp = (p: TenantPaymentActivity) => toMs(p.posted_at || p.created_at)
      const invoiceTimestamp = (i: NonNullable<TenantInvoiceRecord>) => toMs(i.created_at || i.due_date)

      const normalizeInvoiceType = (value: string | null | undefined) =>
        (value || 'rent').toLowerCase() === 'water' ? 'water' : 'rent'

      const eligibleInvoices = invoices
        .filter((i): i is NonNullable<TenantInvoiceRecord> => Boolean(i && i.id))
        .filter((i) => !i.is_covered && !i.is_prestart)

      const latestInvoiceByType = (type: 'rent' | 'water') =>
        eligibleInvoices
          .filter((i) => normalizeInvoiceType(i.invoice_type) === type)
          .sort((a, b) => invoiceTimestamp(b) - invoiceTimestamp(a))[0] || null

      const latestVerifiedPaymentByType = (type: 'rent' | 'water') =>
        verifiedPayments
          .filter((p) => normalizeInvoiceType(p.invoice_type || p.payment_type) === type)
          .sort((a, b) => paymentTimestamp(b) - paymentTimestamp(a))[0] || null

      const makeInvoiceActivity = (invoice: NonNullable<TenantInvoiceRecord>, type: 'rent' | 'water'): ActivityItem => {
        const dateSource = invoice.created_at || invoice.due_date
        const dateLabel = dateSource
          ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'
        const dueLabel = invoice.due_date
          ? new Date(`${invoice.due_date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
          : 'soon'
        const amountLabel = `KES ${Number(invoice.amount || 0).toLocaleString()}`
        const statusLabel = invoice.status ? 'paid' : 'unpaid'
        return {
          id: `invoice-${invoice.id}`,
          title: `${type === 'water' ? 'Water bill' : 'Rent'} invoice (${statusLabel})`,
          description: `${amountLabel} • due ${dueLabel}`,
          dateLabel,
          tone: type === 'water' ? 'water' : 'rent',
          source: 'invoice',
          tagLabel: type === 'water' ? 'Water Invoice' : 'Rent Invoice',
          timestamp: invoiceTimestamp(invoice) || Date.now(),
          href: invoice.id ? `/dashboard/tenant/payment?invoiceId=${invoice.id}` : '/dashboard/tenant/payment',
        }
      }

      const makePaymentActivity = (payment: TenantPaymentActivity, type: 'rent' | 'water'): ActivityItem => {
        const postedAt = payment.posted_at || payment.created_at
        const dateLabel = postedAt
          ? new Date(postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'
        const amountLabel = `KES ${Number(payment.amount_paid || 0).toLocaleString()}`
        const methodLabel = (payment.payment_method || 'M-Pesa').replace('_', ' ')
        return {
          id: `payment-${payment.id}`,
          title: `${type === 'water' ? 'Water bill' : 'Rent'} payment verified`,
          description: `${amountLabel} • via ${methodLabel}`,
          dateLabel,
          tone: type === 'water' ? 'water' : 'rent',
          source: 'payment',
          tagLabel: type === 'water' ? 'Water Payment' : 'Rent Payment',
          timestamp: paymentTimestamp(payment) || Date.now(),
          href: '/dashboard/tenant/payments',
        }
      }

      const rentInvoice = latestInvoiceByType('rent')
      const waterInvoice = latestInvoiceByType('water')
      const rentPayment = latestVerifiedPaymentByType('rent')
      const waterPayment = latestVerifiedPaymentByType('water')

      const openInvoices = eligibleInvoices.filter((invoice) => !invoice.status)
      const openRentInvoices = openInvoices
        .filter((invoice) => normalizeInvoiceType(invoice.invoice_type) === 'rent')
        .sort((a, b) => invoiceTimestamp(b) - invoiceTimestamp(a))
      const openWaterInvoices = openInvoices
        .filter((invoice) => normalizeInvoiceType(invoice.invoice_type) === 'water')
        .sort((a, b) => invoiceTimestamp(b) - invoiceTimestamp(a))

      const depositItem = (() => {
        const latest = pendingDeposits
          .slice()
          .sort((a, b) => paymentTimestamp(b) - paymentTimestamp(a))[0]
        if (!latest) return null
        const postedAt = latest.posted_at || latest.created_at
        const dateLabel = postedAt
          ? new Date(postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'
        const amountLabel = `KES ${Number(latest.amount_paid || 0).toLocaleString()}`
        return {
          id: `deposit-${latest.id}`,
          title: 'Deposit slip submitted',
          description: `${amountLabel} • awaiting verification`,
          dateLabel,
          tone: 'rent' as const,
          source: 'payment' as const,
          tagLabel: 'Pending Verification',
          timestamp: paymentTimestamp(latest) || Date.now(),
          href: '/dashboard/tenant/payments',
        }
      })()

      const rentBest = (() => {
        if (rentPayment && rentInvoice) {
          return paymentTimestamp(rentPayment) >= invoiceTimestamp(rentInvoice)
            ? makePaymentActivity(rentPayment, 'rent')
            : makeInvoiceActivity(rentInvoice, 'rent')
        }
        if (rentPayment) return makePaymentActivity(rentPayment, 'rent')
        if (rentInvoice) return makeInvoiceActivity(rentInvoice, 'rent')
        return null
      })()

      const waterBest = (() => {
        if (waterPayment && waterInvoice) {
          return paymentTimestamp(waterPayment) >= invoiceTimestamp(waterInvoice)
            ? makePaymentActivity(waterPayment, 'water')
            : makeInvoiceActivity(waterInvoice, 'water')
        }
        if (waterPayment) return makePaymentActivity(waterPayment, 'water')
        if (waterInvoice) return makeInvoiceActivity(waterInvoice, 'water')
        return null
      })()

      const rentItems = openRentInvoices.length
        ? openRentInvoices.map((invoice) => makeInvoiceActivity(invoice, 'rent'))
        : rentBest
          ? [rentBest]
          : []

      const waterItems = openWaterInvoices.length
        ? openWaterInvoices.map((invoice) => makeInvoiceActivity(invoice, 'water'))
        : waterBest
          ? [waterBest]
          : []

      const openMaintenance = (maintenanceRequests || []).filter(
        (r) => (r.status || '').toLowerCase() === 'open'
      )
      const maintenanceSource = openMaintenance.length > 0 ? openMaintenance : maintenanceRequests
      const maintenanceLimit = openMaintenance.length > 0 ? 3 : 1

      const maintenanceItems: ActivityItem[] = (maintenanceSource || [])
        .sort((a, b) => {
          const aTime = toMs(a.updated_at || a.created_at)
          const bTime = toMs(b.updated_at || b.created_at)
          return bTime - aTime
        })
        .slice(0, maintenanceLimit)
        .map((request) => {
          const status = (request.status || '').toLowerCase()
          const dateSource = request.updated_at || request.created_at
          const dateLabel = dateSource
            ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—'
          const timestamp = toMs(dateSource) || Date.now()
          const statusLabel = status ? status.replace(/_/g, ' ') : 'Update posted'
          const isOpen = status === 'open'

          return {
            id: request.id,
            title: `Maintenance · ${request.title}`,
            description: isOpen ? 'Status: open' : `Latest update: ${statusLabel}`,
            dateLabel,
            tone: 'maintenance',
            source: 'maintenance',
            tagLabel: isOpen ? 'Maintenance · open' : `Maintenance · ${statusLabel}`,
            timestamp,
            href: '/dashboard/tenant/maintenance',
          }
        })

      const combined = [...maintenanceItems, depositItem, ...rentItems, ...waterItems]
        .filter((x): x is ActivityItem => Boolean(x))
        .sort((a, b) => b.timestamp - a.timestamp)

      setRecentActivity(combined)
      setTenantPayments(payments)
      setMaintenanceCount(openMaintenance.length)
    } catch (error) {
      console.warn('[TenantDashboard] Failed to load recent activity', error)
      setRecentActivity([])
      setTenantPayments([])
      setMaintenanceCount(0)
    }
  }, [])

  const refreshRecentActivity = useCallback(async () => {
    setRecentActivityRefreshing(true)
    try {
      await fetchRecentActivity()
    } finally {
      setRecentActivityRefreshing(false)
    }
  }, [fetchRecentActivity])

  useEffect(() => {
    fetchPendingInvoices()
    refreshRecentActivity()
  }, [fetchPendingInvoices, refreshRecentActivity])

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const nextInvoice = pendingInvoices[0] || null
  const hasPending = pendingInvoices.length > 0
  const rentPaidUntil = summary?.lease?.rent_paid_until || null

  const rentPayments = tenantPayments.filter((payment: any) => {
    const type = (payment?.invoice_type || payment?.payment_type || 'rent').toLowerCase()
    const status = (payment?.status || '').toLowerCase()
    return type === 'rent' && status === 'verified'
  })
  const scoredItemsCount = summary?.rating?.scored_items_count || 0
  const onTimeRate =
    summary?.rating?.rating_percentage === null || summary?.rating?.rating_percentage === undefined
      ? null
      : Number(summary.rating.rating_percentage)
  const paymentsMade = scoredItemsCount > 0 ? scoredItemsCount : rentPayments.length

  const hasRating = onTimeRate !== null

  const ratingDot = useMemo(() => {
    if (onTimeRate === null) return 'bg-slate-300'
    if (onTimeRate >= 90) return 'bg-green-500'
    if (onTimeRate >= 80) return 'bg-yellow-400'
    if (onTimeRate >= 70) return 'bg-orange-500'
    return 'bg-red-500'
  }, [onTimeRate])

  const performanceTheme = useMemo(() => {
    if (onTimeRate === null) {
      return {
        card: 'border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100/80',
        glow: 'bg-slate-200/40',
        icon: 'text-slate-500',
        accentText: 'text-slate-700',
        subtleText: 'text-slate-600/80',
        badgeRing: 'ring-slate-200/60',
        panel: 'border-slate-200/60 bg-gradient-to-br from-white/80 via-slate-50/50 to-slate-100/60',
        panelText: 'text-slate-900/70',
        panelMuted: 'text-slate-700/70',
        labelText: 'text-slate-700/80',
        trackRing: 'ring-slate-100',
        progress: 'from-slate-300 via-slate-200 to-slate-300',
      }
    }
    if (onTimeRate >= 90) {
      return {
        card: 'border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50',
        glow: 'bg-emerald-200/40',
        icon: 'text-emerald-600',
        accentText: 'text-emerald-700',
        subtleText: 'text-emerald-700/80',
        badgeRing: 'ring-emerald-200/60',
        panel: 'border-emerald-200/60 bg-gradient-to-br from-white/80 via-emerald-50/50 to-cyan-50/60',
        panelText: 'text-emerald-900/80',
        panelMuted: 'text-emerald-800/70',
        labelText: 'text-emerald-800/80',
        trackRing: 'ring-emerald-100',
        progress: 'from-emerald-500 via-teal-500 to-cyan-500',
      }
    }
    if (onTimeRate >= 80) {
      return {
        card: 'border-amber-200/70 bg-gradient-to-br from-amber-50 via-yellow-50 to-lime-50',
        glow: 'bg-amber-200/40',
        icon: 'text-amber-600',
        accentText: 'text-amber-700',
        subtleText: 'text-amber-700/80',
        badgeRing: 'ring-amber-200/60',
        panel: 'border-amber-200/60 bg-gradient-to-br from-white/80 via-amber-50/50 to-yellow-50/60',
        panelText: 'text-amber-900/80',
        panelMuted: 'text-amber-800/70',
        labelText: 'text-amber-800/80',
        trackRing: 'ring-amber-100',
        progress: 'from-amber-400 via-yellow-400 to-lime-400',
      }
    }
    if (onTimeRate >= 70) {
      return {
        card: 'border-orange-200/70 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50',
        glow: 'bg-orange-200/40',
        icon: 'text-orange-600',
        accentText: 'text-orange-700',
        subtleText: 'text-orange-700/80',
        badgeRing: 'ring-orange-200/60',
        panel: 'border-orange-200/60 bg-gradient-to-br from-white/80 via-orange-50/50 to-amber-50/60',
        panelText: 'text-orange-900/80',
        panelMuted: 'text-orange-800/70',
        labelText: 'text-orange-800/80',
        trackRing: 'ring-orange-100',
        progress: 'from-orange-500 via-amber-500 to-yellow-500',
      }
    }
    return {
      card: 'border-rose-200/70 bg-gradient-to-br from-rose-50 via-red-50 to-orange-50',
      glow: 'bg-rose-200/40',
      icon: 'text-rose-600',
      accentText: 'text-rose-700',
      subtleText: 'text-rose-700/80',
      badgeRing: 'ring-rose-200/60',
      panel: 'border-rose-200/60 bg-gradient-to-br from-white/80 via-rose-50/50 to-red-50/60',
      panelText: 'text-rose-900/80',
      panelMuted: 'text-rose-800/70',
      labelText: 'text-rose-800/80',
      trackRing: 'ring-rose-100',
      progress: 'from-rose-500 via-red-500 to-orange-500',
    }
  }, [onTimeRate])

  if (!loading && !error && !hasAssignedUnit) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <AiGlowButton
          label="Contact manager"
          thinkingLabel="Dialing"
          onClick={() => {
            window.location.href = 'tel:+254707694388'
          }}
          className={`${styles.danger} scale-[1.4] md:scale-[1.6]`}
        />
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen ${
        leaseExpired
          ? 'bg-gradient-to-b from-rose-200/90 via-rose-50/70 to-rose-200/60'
          : 'bg-gradient-to-b from-slate-50/60 via-white to-orange-50/30'
      }`}
    >
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div
          className={`rounded-3xl bg-white/80 ring-1 shadow-sm backdrop-blur p-4 md:p-6 lg:p-8 space-y-6 mt-4 md:mt-6 ${
            leaseExpired ? 'ring-rose-200/70' : 'ring-slate-200/60'
          }`}
        >
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
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
                <Link href="/dashboard/tenant/invoices">
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
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={refreshRecentActivity}
                disabled={recentActivityRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${recentActivityRefreshing ? 'animate-spin' : ''}`} />
                {recentActivityRefreshing ? 'Refreshing…' : 'Refresh'}
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
                  const toneClasses =
                    tone === 'maintenance'
                      ? 'border-amber-200/70 bg-amber-50/70'
                      : tone === 'water'
                      ? 'border-blue-200/70 bg-blue-50/70'
                      : tone === 'rent'
                      ? 'border-emerald-200/70 bg-emerald-50/70'
                      : 'border-slate-200/70 bg-white'

                  return (
                    <Link
                      key={activity.id}
                      href={activity.href}
                      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2"
                    >
                      <div
                        className={`flex items-start justify-between gap-3 rounded-xl border p-3 transition ${toneClasses} hover:shadow-sm`}
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
                      </div>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Quick actions / stats */}
          <Card className="relative overflow-hidden border-rose-300/70 bg-gradient-to-br from-rose-100 via-white to-amber-50/80 shadow-sm hover:shadow-md transition-shadow">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-rose-300/50 blur-3xl"
            />
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-rose-600" />
                Next Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <div className="flex items-center justify-between rounded-xl border border-rose-300/70 bg-white/80 px-3 py-2 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700/80">Next rent invoice</p>
                  <Badge variant={hasPending ? 'destructive' : 'secondary'}>
                    {hasPending ? 'Pending' : 'Clear'}
                  </Badge>
                </div>
                <div className="rounded-xl border border-rose-300/70 bg-white/80 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-rose-600/80">Amount</p>
                  <div className="text-2xl font-bold text-rose-900">
                    {hasPending ? `${pendingInvoices[0]?.amount?.toLocaleString('en-KE', { maximumFractionDigits: 0 })} KES` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-300/70 bg-white/80 px-3 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-rose-600/80">Due date</p>
                  <div className="text-sm font-medium text-rose-800/80">
                    {hasPending && pendingInvoices[0]?.due_date
                      ? new Date(pendingInvoices[0]?.due_date || '').toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'No pending invoices'}
                  </div>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-rose-200/0 via-rose-200/80 to-rose-200/0" aria-hidden />
              <Button asChild className="w-full">
                <Link href="/dashboard/tenant/invoices">View invoices</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <TenantQuickActions />

        {/* On-time performance */}
        <Card
          className={`relative overflow-hidden shadow-sm hover:shadow-md transition-shadow ${performanceTheme.card}`}
        >
          <div
            aria-hidden
            className={`pointer-events-none absolute -right-20 -top-16 h-40 w-40 rounded-full blur-3xl ${performanceTheme.glow}`}
          />
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className={`h-5 w-5 ${performanceTheme.icon}`} />
                Payment Performance
              </CardTitle>
              <p className={`text-sm ${performanceTheme.subtleText}`}>
                {hasRating ? `${paymentsMade} payments recorded` : 'No rating yet'}
              </p>
            </div>
            <div
              className={`flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-semibold shadow-sm ring-1 ${performanceTheme.accentText} ${performanceTheme.badgeRing}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${ratingDot}`} aria-hidden />
              {hasRating ? `${onTimeRate}% on time` : 'No rating yet'}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className={`rounded-2xl border p-3 shadow-sm ${performanceTheme.panel}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-7 w-7">
                      <div className={`absolute inset-0 rounded-full bg-gradient-to-r ${performanceTheme.progress} animate-spin`} />
                      <div className={`absolute inset-[2px] rounded-full bg-white/90 ring-1 flex items-center justify-center ${performanceTheme.badgeRing}`}>
                        <Clock className={`h-3.5 w-3.5 ${performanceTheme.accentText}`} />
                      </div>
                    </div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${performanceTheme.accentText}`}>
                      Upcoming payments
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      hasPending
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {hasPending ? 'Pending' : 'All clear'}
                  </span>
                </div>
                <div className={`mt-2 text-sm ${performanceTheme.panelText}`}>
                  {hasPending ? 'Pending invoices detected in your account.' : 'No pending invoices right now.'}
                </div>
                <div className={`mt-2 text-xs ${performanceTheme.panelMuted}`}>
                  {hasPending
                    ? 'Pay early to keep your on-time score high.'
                    : 'Great work staying ahead on rent.'}
                </div>
              </div>
              <div className="space-y-2">
                <p className={`text-sm ${performanceTheme.labelText}`}>
                  {hasRating ? 'On-time payments' : 'Rating pending'}
                </p>
                <div className={`w-full bg-white/70 h-2 rounded-full overflow-hidden ring-1 ${performanceTheme.trackRing}`}>
                  <div
                    className={`h-2 rounded-full bg-gradient-to-r ${performanceTheme.progress}`}
                    style={{ width: `${hasRating ? Math.min(onTimeRate || 0, 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <footer className="pt-6">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Legal & Privacy</p>
                <p className="text-xs text-muted-foreground">
                  Review how your data is used, and how reminders/communications work.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline"
                  href="/dashboard/tenant/legal/privacy"
                >
                  Privacy Policy
                </Link>
                <span className="text-slate-300">•</span>
                <Link
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline"
                  href="/dashboard/tenant/legal/consent"
                >
                  Consent
                </Link>
                <span className="text-slate-300">•</span>
                <Link
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline"
                  href="/dashboard/tenant/legal/terms"
                >
                  Terms
                </Link>
                <span className="text-slate-300">•</span>
                <Link
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline"
                  href="/dashboard/tenant/legal/security"
                >
                  Security Policy
                </Link>
                <span className="text-slate-300">•</span>
                <Link
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline"
                  href="/dashboard/tenant/legal/cookies"
                >
                  Cookie Notice
                </Link>
              </div>
            </div>
          </div>
        </footer>
        </div>
      </div>
    </div>
  )
}
