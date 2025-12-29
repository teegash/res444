'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileText, Calendar, AlertCircle, UploadCloud } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ChronoSelect } from '@/components/ui/chrono-select'
import { useToast } from '@/components/ui/use-toast'
import { exportLeasePdf } from '@/lib/pdf/leaseDocument'
import { createRenewalByLease, getRenewalByLease, getRenewalDownloadUrl, tenantSignRenewal } from '@/src/actions/leaseRenewals'

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type LeaseDetails = {
  id: string
  start_date: string
  end_date: string | null
  monthly_rent: number | null
  deposit_amount: number | null
  status: string | null
  lease_agreement_url: string | null
  rent_auto_populated: boolean | null
  rent_locked_reason: string | null
  lease_auto_generated: boolean | null
  created_at: string | null
  updated_at: string | null
  unit?: {
    id: string
    unit_number: string | null
    floor: number | null
    number_of_bedrooms: number | null
    number_of_bathrooms: number | null
    size_sqft: number | null
    building?: {
      id: string
      name: string | null
      location: string | null
    } | null
  } | null
}

type LeaseRenewal = {
  id: string
  status: string
  pdf_unsigned_path: string | null
  pdf_tenant_signed_path: string | null
  pdf_fully_signed_path: string | null
  proposed_start_date?: string | null
  proposed_end_date?: string | null
}

type VacateNotice = {
  id: string
  status: string | null
  requested_vacate_date: string | null
  notice_document_url?: string | null
  notice_submitted_at?: string | null
  acknowledged_at?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  completed_at?: string | null
  manager_notes?: string | null
  created_at?: string | null
}

type VacateEvent = {
  id: string
  action?: string | null
  created_at?: string | null
  metadata?: any
}

const isValidRenewalId = (value?: string | null) =>
  Boolean(value && value !== 'undefined' && value !== 'null' && uuidRegex.test(value))

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

const formatDate = (value?: string | null, fallback = '—') => {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const parseDateOnly = (value?: string | null) => {
  if (!value) return null
  const raw = value.trim()
  const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
  const [y, m, d] = base.split('-').map((part) => Number(part))
  if (y && m && d) {
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

const toIsoDate = (value: Date | null) => {
  if (!value) return null
  return value.toISOString().slice(0, 10)
}

const MAX_VACATE_FILE_BYTES = 10 * 1024 * 1024
const VACATE_FILE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg'])

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let idx = 0
  let size = bytes
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

const toDateString = (date?: Date) => {
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fromDateString = (value: string) => {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

const addDaysUtc = (date: Date, days: number) => {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const monthsBetweenUtc = (start: Date, end: Date) =>
  (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())

const lastDayOfMonthUtc = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0))

const addMonthsPreserveDayUtc = (date: Date, months: number) => {
  const startDay = date.getUTCDate()
  const rawMonth = date.getUTCMonth() + months
  const year = date.getUTCFullYear() + Math.floor(rawMonth / 12)
  const monthIndex = ((rawMonth % 12) + 12) % 12
  const lastDay = lastDayOfMonthUtc(year, monthIndex).getUTCDate()
  const day = Math.min(startDay, lastDay)
  return new Date(Date.UTC(year, monthIndex, day))
}

const deriveRenewalDates = (start?: string | null, end?: string | null) => {
  const leaseStart = parseDateOnly(start)
  const leaseEnd = parseDateOnly(end)
  if (!leaseEnd) return { start: null, end: null }
  const termMonthsRaw = leaseStart && leaseEnd ? monthsBetweenUtc(leaseStart, leaseEnd) : 0
  const termMonths = termMonthsRaw > 0 ? termMonthsRaw : 12
  const renewalStart = addDaysUtc(leaseEnd, 1)
  const renewalEnd =
    termMonths % 12 === 0
      ? addMonthsPreserveDayUtc(renewalStart, termMonths)
      : lastDayOfMonthUtc(renewalStart.getUTCFullYear(), renewalStart.getUTCMonth() + termMonths - 1)
  return { start: toIsoDate(renewalStart), end: toIsoDate(renewalEnd) }
}

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return currencyFormatter.format(value)
}

const statusBadgeClasses = (status?: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'valid':
      return 'bg-green-100 text-green-700'
    case 'renewed':
      return 'bg-sky-100 text-sky-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'expired':
    case 'ended':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-gray-200 text-gray-700'
  }
}

const vacateStatusClasses = (status?: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'submitted':
      return 'bg-slate-100 text-slate-700'
    case 'acknowledged':
      return 'bg-blue-100 text-blue-700'
    case 'approved':
      return 'bg-emerald-100 text-emerald-700'
    case 'rejected':
      return 'bg-rose-100 text-rose-700'
    case 'completed':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export default function LeasePage() {
  const searchParams = useSearchParams()
  const vacateNoticeRef = useRef<HTMLDivElement | null>(null)
  const vacateFileInputRef = useRef<HTMLInputElement | null>(null)
  const [lease, setLease] = useState<LeaseDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [renewal, setRenewal] = useState<LeaseRenewal | null>(null)
  const [renewalLoading, setRenewalLoading] = useState(false)
  const [renewalBusy, setRenewalBusy] = useState<null | 'create' | 'tenantSign' | 'download'>(null)
  const [vacateNotice, setVacateNotice] = useState<VacateNotice | null>(null)
  const [vacateEvents, setVacateEvents] = useState<VacateEvent[]>([])
  const [vacateLoading, setVacateLoading] = useState(false)
  const [vacateError, setVacateError] = useState<string | null>(null)
  const [vacateDragActive, setVacateDragActive] = useState(false)
  const [vacateDate, setVacateDate] = useState('')
  const [vacateFile, setVacateFile] = useState<File | null>(null)
  const [vacateSubmitting, setVacateSubmitting] = useState(false)
  const [showVacateForm, setShowVacateForm] = useState(true)
  const { toast } = useToast()

  const refreshRenewal = useCallback(async (leaseId?: string | null) => {
    if (!leaseId || leaseId === 'undefined') {
      setRenewal(null)
      setRenewalLoading(false)
      return
    }
    setRenewalLoading(true)
    try {
      const res: any = await getRenewalByLease(leaseId)
      const nextRenewal = res?.activeRenewal || res?.latestRenewal
      setRenewal(nextRenewal?.id ? nextRenewal : null)
    } catch (e) {
      console.warn('[LeasePage] Failed to load renewal', e)
    } finally {
      setRenewalLoading(false)
    }
  }, [])

  useEffect(() => {
    const fetchLease = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/tenant/lease', { cache: 'no-store' })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to fetch lease information.')
        }
        const payload = await response.json()
        setLease(payload.data || null)
        if (payload.data?.id) {
          refreshRenewal(payload.data.id)
        }
      } catch (err) {
        console.error('[LeasePage] fetch failed', err)
        setError(err instanceof Error ? err.message : 'Unable to load lease info.')
      } finally {
        setLoading(false)
      }
    }

    fetchLease()
  }, [])

  const refreshVacateNotice = useCallback(async () => {
    setVacateLoading(true)
    setVacateError(null)
    try {
      const response = await fetch('/api/tenant/vacate-notices', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load vacate notice.')
      }
      setVacateNotice(payload.notice || null)
      setVacateEvents(payload.events || [])
      setShowVacateForm(!payload.notice)
    } catch (err) {
      console.error('[LeasePage] vacate notice fetch failed', err)
      setVacateError(err instanceof Error ? err.message : 'Unable to load vacate notice.')
    } finally {
      setVacateLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshVacateNotice()
  }, [refreshVacateNotice])

  useEffect(() => {
    if (searchParams.get('tab') === 'vacate_notice') {
      vacateNoticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [searchParams])

  useEffect(() => {
    const fetchSigned = async () => {
      try {
        const res = await fetch('/api/tenant/lease/document', { cache: 'no-store' })
        const json = await res.json()
        if (res.ok && json.success) {
          setLease((prev) =>
            prev
              ? { ...prev, lease_agreement_url: json.url || prev.lease_agreement_url }
              : prev
          )
        }
      } catch (err) {
        console.warn('[LeasePage] signed URL fetch failed', err)
      }
    }
    fetchSigned()
  }, [])

  const derivedRenewalDates = useMemo(
    () => deriveRenewalDates(lease?.start_date, lease?.end_date),
    [lease?.end_date, lease?.start_date]
  )

  const effectiveStartDate = useMemo(() => {
    if (renewal?.status === 'completed') {
      return renewal.proposed_start_date || derivedRenewalDates.start || lease?.start_date || null
    }
    return lease?.start_date || null
  }, [derivedRenewalDates.start, lease?.start_date, renewal?.proposed_start_date, renewal?.status])

  const effectiveEndDate = useMemo(() => {
    if (renewal?.status === 'completed') {
      return renewal.proposed_end_date || derivedRenewalDates.end || lease?.end_date || null
    }
    return lease?.end_date || null
  }, [derivedRenewalDates.end, lease?.end_date, renewal?.proposed_end_date, renewal?.status])

  const propertyName = lease?.unit?.building?.name || '—'
  const propertyLocation = lease?.unit?.building?.location || '—'
  const unitLabel = lease?.unit?.unit_number || '—'
  const leasePeriod =
    effectiveStartDate || effectiveEndDate
      ? `${formatDate(effectiveStartDate)} – ${formatDate(effectiveEndDate)}`
      : '—'
  const monthlyRent = formatCurrency(lease?.monthly_rent)
  const depositAmount = formatCurrency(lease?.deposit_amount)
  const leaseStatus = useMemo(() => {
    if (!lease) return 'Unknown'
    const start = effectiveStartDate ? new Date(effectiveStartDate) : null
    const end = effectiveEndDate ? new Date(effectiveEndDate) : null
    const today = new Date()
    const statusValue = (lease.status || '').toLowerCase()
    const isRenewed = statusValue === 'renewed' || renewal?.status === 'completed'

    if (start && start <= today && (!end || end >= today)) {
      return 'valid'
    }
    if (end && end < today) {
      return 'expired'
    }
    if (start && start > today) {
      return isRenewed ? 'renewed' : 'pending'
    }
    return lease.status || 'pending'
  }, [effectiveEndDate, effectiveStartDate, lease, renewal?.status])

  const renewalWindowOpen = useMemo(() => {
    if (!effectiveEndDate) return false
    const end = new Date(effectiveEndDate)
    const now = new Date()
    const diffDays = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (Number.isNaN(diffDays)) return false
    return diffDays >= 0 && diffDays <= 60
  }, [effectiveEndDate])

  const hasActiveRenewal = Boolean(
    renewal && ['draft', 'sent_for_signature', 'in_progress'].includes(renewal.status)
  )

  const canStartRenewal = renewalWindowOpen && !hasActiveRenewal
  const agreementUrl = lease?.lease_agreement_url || ''

  const minVacateDate = useMemo(() => {
    const now = new Date()
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    base.setUTCDate(base.getUTCDate() + 30)
    return toIsoDate(base) || ''
  }, [])

  const vacateTimeline = useMemo(() => {
    if (!vacateNotice) return []
    if (vacateEvents.length > 0) {
      return vacateEvents.map((event) => ({
        label: event.action || (event as any).event_type || (event as any).type || 'update',
        date: event.created_at || null,
      }))
    }
    return [
      { label: 'submitted', date: vacateNotice.notice_submitted_at || vacateNotice.created_at || null },
      { label: 'acknowledged', date: vacateNotice.acknowledged_at || null },
      { label: 'approved', date: vacateNotice.approved_at || null },
      { label: 'rejected', date: vacateNotice.rejected_at || null },
      { label: 'completed', date: vacateNotice.completed_at || null },
    ].filter((step) => step.date)
  }, [vacateEvents, vacateNotice])

  const vacateProgress = useMemo(() => {
    if (!vacateNotice || !vacateNotice.requested_vacate_date) return null
    const status = String(vacateNotice.status || '').toLowerCase()
    if (status === 'rejected') return null

    const end = parseDateOnly(vacateNotice.requested_vacate_date)
    const startRaw = vacateNotice.notice_submitted_at || vacateNotice.created_at || null
    const start = startRaw ? parseDateOnly(startRaw) : null
    if (!end) return null

    const safeStart = start || new Date()
    const startDay = new Date(Date.UTC(safeStart.getUTCFullYear(), safeStart.getUTCMonth(), safeStart.getUTCDate()))
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

    const totalMs = Math.max(1, endDay.getTime() - startDay.getTime())
    const today = new Date()
    const todayDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const elapsedMs = Math.min(Math.max(todayDay.getTime() - startDay.getTime(), 0), totalMs)
    const progress = status === 'completed' ? 1 : elapsedMs / totalMs
    const daysRemaining = Math.max(0, Math.ceil((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24)))
    const totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)))

    return {
      progress,
      daysRemaining,
      totalDays,
      endLabel: formatDate(vacateNotice.requested_vacate_date),
    }
  }, [vacateNotice])

  const handleVacateFile = useCallback((file: File | null) => {
    if (!file) {
      setVacateFile(null)
      return
    }
    if (!VACATE_FILE_TYPES.has(file.type)) {
      setVacateFile(null)
      setVacateError('Only PDF, PNG, or JPG files are allowed.')
      return
    }
    if (file.size > MAX_VACATE_FILE_BYTES) {
      setVacateFile(null)
      setVacateError('File is too large. Max size is 10MB.')
      return
    }
    setVacateFile(file)
    setVacateError(null)
  }, [])

  const handleVacateSubmit = useCallback(async () => {
    if (!vacateDate) {
      setVacateError('Select a vacate date at least 30 days from today.')
      return
    }
    if (minVacateDate && vacateDate < minVacateDate) {
      setVacateError('Vacate date must be at least 30 days from today.')
      return
    }
    if (!vacateFile) {
      setVacateError('Please attach a notice document (PDF or image).')
      return
    }
    setVacateSubmitting(true)
    setVacateError(null)
    try {
      const form = new FormData()
      form.set('requested_vacate_date', vacateDate)
      if (lease?.id) form.set('lease_id', lease.id)
      form.set('file', vacateFile)

      const response = await fetch('/api/tenant/vacate-notices', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to submit vacate notice.')
      }
      toast({
        title: 'Notice submitted',
        description: 'Your vacate notice has been sent to management.',
      })
      setVacateDate('')
      setVacateFile(null)
      setShowVacateForm(false)
      await refreshVacateNotice()
    } catch (err) {
      setVacateError(err instanceof Error ? err.message : 'Failed to submit vacate notice.')
    } finally {
      setVacateSubmitting(false)
    }
  }, [lease?.id, refreshVacateNotice, toast, vacateDate, vacateFile])

  const handleVacateDownload = useCallback(async () => {
    if (!vacateNotice?.id) return
    try {
      const res = await fetch(`/api/vacate-notices/${vacateNotice.id}/document`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Download unavailable.')
      }
      window.open(json.url, '_blank')
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Unable to download notice document.',
        variant: 'destructive',
      })
    }
  }, [toast, vacateNotice?.id])

  const renewalInfo = useMemo(() => {
    if (!effectiveEndDate) {
      return {
        message: 'No lease end date on file. Contact management for renewal information.',
        highlight: false,
      }
    }
    const end = new Date(effectiveEndDate)
    const now = new Date()
    const diffDays = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (Number.isNaN(diffDays)) {
      return {
        message: `Your lease expires on ${formatDate(effectiveEndDate)}.`,
        highlight: false,
      }
    }
    if (diffDays < 0) {
      return {
        message: `This lease expired on ${formatDate(effectiveEndDate)}.`,
        highlight: true,
      }
    }
    if (diffDays <= 60) {
      return {
        message: `Your lease expires on ${formatDate(effectiveEndDate)}. You can renew any time within the next ${diffDays} days.`,
        highlight: true,
      }
    }
    return {
      message: `Your lease expires on ${formatDate(effectiveEndDate)}. Renewal will open ${60} days before expiration.`,
      highlight: false,
    }
  }, [effectiveEndDate])

  const generatePdf = useCallback(async () => {
    if (!lease) {
      toast({
        title: 'Lease unavailable',
        description: 'We could not find lease details to export.',
        variant: 'destructive',
      })
      return
    }

    const summary = [
      { label: 'Property', value: propertyName },
      { label: 'Unit', value: unitLabel },
      { label: 'Location', value: propertyLocation },
      { label: 'Lease Period', value: leasePeriod },
      { label: 'Status', value: leaseStatus },
      { label: 'Monthly Rent', value: monthlyRent },
    ]

    const sections = [
      {
        title: 'Lease Terms',
        rows: [
          { label: 'Start Date', value: formatDate(effectiveStartDate) },
          { label: 'End Date', value: formatDate(effectiveEndDate) },
          { label: 'Monthly Rent', value: monthlyRent },
          { label: 'Deposit Amount', value: depositAmount },
        ],
      },
      {
        title: 'Property Details',
        rows: [
          { label: 'Property Name', value: propertyName },
          { label: 'Location', value: propertyLocation },
          { label: 'Unit Label', value: unitLabel },
          { label: 'Lease ID', value: lease.id },
        ],
      },
      {
        title: 'Documents & Metadata',
        rows: [
          { label: 'Agreement Uploaded', value: agreementUrl ? 'Available' : 'Not provided' },
          { label: 'Last Updated', value: lease.updated_at ? formatDate(lease.updated_at) : '—' },
          {
            label: 'Rent Scheduling',
            value: lease.rent_auto_populated ? 'Auto-generated' : 'Manual invoices',
          },
        ],
      },
    ]

    const notes = [
      'This PDF is a tenant portal copy of your executed lease.',
      'Contact your property manager if any term appears inaccurate.',
    ]

    await exportLeasePdf({
      fileName: 'lease-agreement.pdf',
      headerTitle: 'Tenant Lease Agreement',
      headerSubtitle: 'Certified tenant portal copy',
      summary,
      sections,
      notes,
      letterhead: {
        tenantName: 'Tenant',
        propertyName: propertyName || undefined,
        unitNumber: unitLabel || undefined,
        documentTitle: 'Tenant Lease Agreement',
      },
    })
  }, [
    lease,
    propertyName,
    propertyLocation,
    unitLabel,
    leasePeriod,
    leaseStatus,
    monthlyRent,
    depositAmount,
    agreementUrl,
    toast,
  ])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await generatePdf()
    } finally {
      setDownloading(false)
    }
  }

  const downloadActions = (
    <>
      {agreementUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={agreementUrl} target="_blank" rel="noreferrer" className="flex items-center">
            <Download className="h-4 w-4 mr-2" />
            Original File
          </a>
        </Button>
      )}
      <Button variant="default" size="sm" onClick={handleDownload} disabled={downloading || loading}>
        <Download className="h-4 w-4 mr-2" />
        {downloading ? 'Generating…' : 'Download Lease PDF'}
      </Button>
    </>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/30 via-white to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center justify-between gap-3 md:hidden">
            <Link href="/dashboard/tenant">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex flex-wrap items-center gap-2">{downloadActions}</div>
          </div>

          <div className="flex items-center gap-3 md:flex-1">
            <Link href="/dashboard/tenant" className="hidden md:inline-flex">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold">Lease Agreement</h1>
          </div>

          <div className="hidden md:flex md:ml-auto gap-2">{downloadActions}</div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        )}

        {!loading && !lease && !error && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No lease information found. Please contact management for assistance.
            </CardContent>
          </Card>
        )}

        {/* Lease Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Lease Overview</CardTitle>
            <CardDescription>Your current lease agreement details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">{loading ? 'Loading…' : propertyName}</p>
                <p className="text-xs text-muted-foreground">{propertyLocation}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Unit</p>
                <p className="font-semibold">{loading ? 'Loading…' : unitLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Lease Period</p>
                <p className="font-semibold">{loading ? 'Loading…' : leasePeriod}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Monthly Rent</p>
                <p className="font-semibold text-green-600">{loading ? 'Loading…' : monthlyRent}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Deposit Amount</p>
                <p className="font-semibold">{loading ? 'Loading…' : depositAmount}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Status</p>
                <Badge className={statusBadgeClasses(leaseStatus)}>{leaseStatus}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Important Dates & Key Terms */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <CardTitle>Important Dates</CardTitle>
              </div>
              <CardDescription>Key dates for your lease</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium">Lease start</p>
                  <p className="text-muted-foreground">{formatDate(effectiveStartDate)}</p>
                </div>
                <Badge variant="outline">start</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div>
                  <p className="font-medium">Lease end</p>
                  <p className="text-muted-foreground">{formatDate(effectiveEndDate)}</p>
                </div>
                <Badge variant="outline" className="border-purple-500 text-purple-700">
                  expiry
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Last updated</p>
                  <p className="text-muted-foreground">{formatDate(lease?.updated_at)}</p>
                </div>
                <Badge variant="outline">system</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Lease Terms</CardTitle>
              <CardDescription>Important terms and conditions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Monthly Rent</p>
                <p className="text-muted-foreground">{monthlyRent} due on the 1st of each month</p>
              </div>
              <div>
                <p className="font-medium">Security Deposit</p>
                <p className="text-muted-foreground">{depositAmount}</p>
              </div>
              <div>
                <p className="font-medium">Auto-generated Lease</p>
                <p className="text-muted-foreground">
                  {lease?.lease_auto_generated ? 'Yes, generated in the portal' : 'No, manually uploaded'}
                </p>
              </div>
              <div>
                <p className="font-medium">Rent Auto-Populated</p>
                <p className="text-muted-foreground">
                  {lease?.rent_auto_populated ? 'Rent is synced with billing' : 'Rent is managed manually'}
                </p>
              </div>
              {lease?.rent_locked_reason && (
                <div>
                  <p className="font-medium">Rent Lock Reason</p>
                  <p className="text-muted-foreground">{lease.rent_locked_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lease Renewal */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <CardTitle>Lease Renewal</CardTitle>
            </div>
            <CardDescription>Information about renewing your lease</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`p-4 rounded-lg border mb-4 ${
                renewalInfo.highlight
                  ? 'bg-orange-50 border-orange-200 text-orange-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <p className="text-sm font-medium">{renewalInfo.highlight ? 'Action required' : 'Heads up'}</p>
              <p className="text-sm mt-1">{renewalInfo.message}</p>
            </div>

            <div className="rounded-lg border p-4 bg-white mb-4 space-y-3">
              {renewalLoading ? (
                <div className="text-sm text-muted-foreground">Loading renewal status…</div>
              ) : !lease?.id ? (
                <div className="text-sm text-muted-foreground">Lease not loaded.</div>
              ) : !renewal ? (
                <>
                  <div className="text-sm text-muted-foreground">No renewal has been started yet.</div>
                  {canStartRenewal ? (
                    <Button
                      disabled={!lease?.id || lease.id === 'undefined' || renewalBusy === 'create'}
                      onClick={async () => {
                        if (!lease?.id) {
                          toast({
                            title: 'Lease unavailable',
                            description: 'Load your lease details before starting a renewal.',
                            variant: 'destructive',
                          })
                          return
                        }
                        try {
                          setRenewalBusy('create')
                          const res: any = await createRenewalByLease(lease.id)
                          if (res?.ok === false) {
                            throw new Error(res?.error || 'Failed to start renewal.')
                          }
                          await refreshRenewal(lease.id)
                          toast({ title: 'Renewal created', description: 'Open it and sign when ready.' })
                        } catch (e: any) {
                          toast({
                            title: 'Failed to start renewal',
                            description: e?.message ?? 'Error',
                            variant: 'destructive',
                          })
                        } finally {
                          setRenewalBusy(null)
                        }
                      }}
                    >
                      Renew Lease
                    </Button>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Renewal opens 60 days before lease end.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      Status:{' '}
                      <Badge className="ml-2" variant="secondary">
                        {renewal.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        !renewal?.id ||
                        renewal.id === 'undefined' ||
                        !renewal.pdf_unsigned_path ||
                        renewalBusy === 'download'
                      }
                      onClick={async () => {
                        try {
                          if (!renewal?.id || renewal.id === 'undefined') {
                            toast({
                              title: 'Download failed',
                              description: 'Missing renewal reference. Please refresh the page.',
                              variant: 'destructive',
                            })
                            return
                          }
                          setRenewalBusy('download')
                          const res: any = await getRenewalDownloadUrl(renewal.id, 'unsigned')
                          if (res?.ok === false) {
                            throw new Error(res?.error || 'Download failed')
                          }
                          if (!res?.url) {
                            throw new Error('Download URL unavailable')
                          }
                          window.open(res.url, '_blank')
                        } catch (e: any) {
                          toast({ title: 'Download failed', description: e?.message ?? 'Error', variant: 'destructive' })
                        } finally {
                          setRenewalBusy(null)
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Unsigned
                    </Button>

                    <Button
                      variant="outline"
                      disabled={
                        !renewal?.id ||
                        renewal.id === 'undefined' ||
                        !renewal.pdf_tenant_signed_path ||
                        renewalBusy === 'download'
                      }
                      onClick={async () => {
                        try {
                          if (!renewal?.id || renewal.id === 'undefined') {
                            toast({
                              title: 'Download failed',
                              description: 'Missing renewal reference. Please refresh the page.',
                              variant: 'destructive',
                            })
                            return
                          }
                          setRenewalBusy('download')
                          const res: any = await getRenewalDownloadUrl(renewal.id, 'tenant_signed')
                          if (res?.ok === false) {
                            throw new Error(res?.error || 'Download failed')
                          }
                          if (!res?.url) {
                            throw new Error('Download URL unavailable')
                          }
                          window.open(res.url, '_blank')
                        } catch (e: any) {
                          toast({ title: 'Download failed', description: e?.message ?? 'Error', variant: 'destructive' })
                        } finally {
                          setRenewalBusy(null)
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Tenant-Signed
                    </Button>

                    <Button
                      variant="outline"
                      disabled={
                        !renewal?.id ||
                        renewal.id === 'undefined' ||
                        !renewal.pdf_fully_signed_path ||
                        renewalBusy === 'download'
                      }
                      onClick={async () => {
                        try {
                          if (!renewal?.id || renewal.id === 'undefined') {
                            toast({
                              title: 'Download failed',
                              description: 'Missing renewal reference. Please refresh the page.',
                              variant: 'destructive',
                            })
                            return
                          }
                          setRenewalBusy('download')
                          const res: any = await getRenewalDownloadUrl(renewal.id, 'fully_signed')
                          if (res?.ok === false) {
                            throw new Error(res?.error || 'Download failed')
                          }
                          if (!res?.url) {
                            throw new Error('Download URL unavailable')
                          }
                          window.open(res.url, '_blank')
                        } catch (e: any) {
                          toast({
                            title: 'Download failed',
                            description: e?.message ?? 'Error',
                            variant: 'destructive',
                          })
                        } finally {
                          setRenewalBusy(null)
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Fully Signed
                    </Button>
                  </div>

                  <div className="pt-2 space-y-2">
                    {canStartRenewal && renewal.status === 'completed' ? (
                      <Button
                        variant="outline"
                        disabled={!lease?.id || renewalBusy === 'create'}
                        onClick={async () => {
                          try {
                            setRenewalBusy('create')
                            const res: any = await createRenewalByLease(lease.id)
                            if (res?.ok === false) {
                              throw new Error(res?.error || 'Failed to start renewal.')
                            }
                            await refreshRenewal(lease.id)
                            toast({
                              title: 'Renewal created',
                              description: 'A new renewal is ready for signing.',
                            })
                          } catch (e: any) {
                            toast({
                              title: 'Failed to start renewal',
                              description: e?.message ?? 'Error',
                              variant: 'destructive',
                            })
                          } finally {
                            setRenewalBusy(null)
                          }
                        }}
                      >
                        Renew Lease
                      </Button>
                    ) : null}
                    <Button
                      disabled={
                        renewal.status !== 'sent_for_signature' ||
                        renewalBusy === 'tenantSign' ||
                        !isValidRenewalId(renewal?.id)
                      }
                      onClick={async () => {
                        try {
                          setRenewalBusy('tenantSign')
                          if (!isValidRenewalId(renewal?.id)) {
                            throw new Error('Missing renewal reference. Please refresh the page.')
                          }
                          const res: any = await tenantSignRenewal(renewal.id)
                          if (res?.ok === false) {
                            throw new Error(res?.error || 'Signing failed')
                          }
                          await refreshRenewal(lease.id)
                          toast({
                            title: 'Signed',
                            description: 'Your signature has been applied. Awaiting countersign.',
                          })
                        } catch (e: any) {
                          toast({
                            title: 'Signing failed',
                            description: e?.message ?? 'Error',
                            variant: 'destructive',
                          })
                        } finally {
                          setRenewalBusy(null)
                        }
                      }}
                    >
                      Sign Renewal
                    </Button>

                    {renewal.status !== 'sent_for_signature' && (
                      <div className="text-xs text-muted-foreground">
                        Signing is enabled only when the renewal is sent for signature.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current Status</p>
                <p className="font-semibold">{leaseStatus}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Evacuation Notice</p>
                <p className="font-semibold">30 days (standard)</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-6 items-start sm:items-center">
              <div className="text-sm text-muted-foreground">
                Renewals are initiated by management. You will be notified when a renewal is available for signing.
              </div>
              <Link href="/dashboard/tenant/messages">
                <Button variant="outline">Contact Property Manager</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Vacation Notice */}
        <div ref={vacateNoticeRef} id="vacate-notice">
          <Card>
            <CardHeader>
              <CardTitle>Vacation Notice</CardTitle>
              <CardDescription>Submit or track your 30-day vacate notice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {vacateLoading ? (
              <div className="text-sm text-muted-foreground">Loading vacate notice…</div>
            ) : vacateNotice && !showVacateForm ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={vacateStatusClasses(vacateNotice.status)}>
                    {(vacateNotice.status || 'submitted').toString()}
                  </Badge>
                  <div className="text-sm text-muted-foreground">
                    Requested move-out: {formatDate(vacateNotice.requested_vacate_date)}
                  </div>
                </div>

                {vacateNotice.manager_notes ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <p className="font-medium">Manager notes</p>
                    <p className="mt-1">{vacateNotice.manager_notes}</p>
                  </div>
                ) : null}

                {vacateProgress ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>Submitted</span>
                      <span>{vacateProgress.endLabel}</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round(vacateProgress.progress * 100)}%`,
                          backgroundImage:
                            'linear-gradient(90deg, #3b82f6 0%, #22c55e 30%, #eab308 55%, #f97316 75%, #ef4444 100%)',
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                      <span>{Math.round(vacateProgress.progress * 100)}% complete</span>
                      <span>
                        {vacateProgress.daysRemaining} days left of {vacateProgress.totalDays}
                      </span>
                    </div>
                  </div>
                ) : null}

                {vacateTimeline.length > 0 ? (
                  <div className="grid gap-2 text-sm">
                    {vacateTimeline.map((step) => (
                      <div key={`${step.label}-${step.date}`} className="flex items-center justify-between rounded-md border p-2">
                        <span className="capitalize">{step.label.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">{formatDate(step.date)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No timeline updates yet.</div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleVacateDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download notice
                  </Button>
                  {String(vacateNotice.status || '').toLowerCase() === 'rejected' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowVacateForm(true)
                        setVacateError(null)
                      }}
                    >
                      Submit new notice
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
                  Vacate notices must be submitted at least 30 days before your intended move-out date.
                </div>
                {vacateError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {vacateError}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Vacate date</label>
                    <ChronoSelect
                      value={fromDateString(vacateDate)}
                      onChange={(date) => setVacateDate(toDateString(date))}
                      placeholder="Select vacate date"
                      className="w-full justify-start"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Earliest allowed: {formatDate(minVacateDate)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Notice document</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => vacateFileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          vacateFileInputRef.current?.click()
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault()
                        setVacateDragActive(true)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setVacateDragActive(true)
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault()
                        setVacateDragActive(false)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        setVacateDragActive(false)
                        const file = e.dataTransfer.files?.[0] || null
                        handleVacateFile(file)
                      }}
                      className={`mt-1 w-full rounded-xl border border-dashed p-3 text-left transition ${
                        vacateDragActive
                          ? 'border-blue-400 bg-blue-50/70 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                          : 'border-slate-300 bg-white/80 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${vacateDragActive ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <UploadCloud className={`h-5 w-5 ${vacateDragActive ? 'text-blue-600' : 'text-slate-500'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {vacateDragActive ? 'Drop file to upload' : 'Choose or drop a file'}
                          </p>
                          <p className="text-xs text-muted-foreground">PDF, JPG, or PNG up to 10MB</p>
                        </div>
                      </div>
                    </div>
                    <Input
                      ref={vacateFileInputRef}
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => handleVacateFile(e.target.files?.[0] || null)}
                    />
                    {vacateFile ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        Selected: <span className="font-medium">{vacateFile.name}</span> • {formatBytes(vacateFile.size)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Button onClick={handleVacateSubmit} disabled={vacateSubmitting}>
                  {vacateSubmitting ? (
                    <>Submitting…</>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4 mr-2" />
                      Submit notice
                    </>
                  )}
                </Button>
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        {/* Lease Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Lease Documents</CardTitle>
            <CardDescription>Download your lease-related documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {agreementUrl ? (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Lease Agreement</p>
                    <p className="text-xs text-muted-foreground">Most recent version on file</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href={agreementUrl} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No digital lease documents are currently attached to your account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
