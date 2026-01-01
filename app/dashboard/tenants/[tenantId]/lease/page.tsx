'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, ArrowLeft, Download, Calendar, FileText, UploadCloud } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { exportLeasePdf } from '@/lib/pdf/leaseDocument'
import {
  createRenewalByLease,
  getRenewalByLease,
  getRenewalDownloadUrl,
  managerSignRenewal,
} from '@/src/actions/leaseRenewals'

interface LeaseResponse {
  tenant: {
    id: string
    full_name: string | null
    phone_number: string | null
    profile_picture_url: string | null
    address: string | null
  }
  lease: {
    id: string
    unit_id: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    deposit_amount: number | null
    status: string | null
    lease_agreement_url?: string | null
    unit?: {
      id: string
      unit_number: string | null
      unit_price_category: string | null
      building?: {
        id: string
        name: string | null
        location: string | null
      } | null
    } | null
  } | null
  lease_status: {
    status: string
    detail: string
  }
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
  tenant_user_id?: string | null
}

type VacateEvent = {
  id: string
  action?: string | null
  created_at?: string | null
  metadata?: any
}

const durationOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 6)

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

const statusBadgeClasses = (status?: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'valid':
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'renewed':
      return 'bg-sky-100 text-sky-700'
    case 'expired':
      return 'bg-rose-100 text-rose-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-700'
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

function summarizeLease(lease: LeaseResponse['lease'] | null) {
  if (!lease) {
    return { status: 'unassigned', detail: 'Lease has not been assigned.' }
  }
  const today = new Date()
  const start = lease.start_date ? new Date(lease.start_date) : null
  const end = lease.end_date ? new Date(lease.end_date) : null

  if (start && start <= today && (!end || end >= today)) {
    return { status: 'valid', detail: 'Lease is currently active.' }
  }
  if (end && end < today) {
    return { status: 'expired', detail: `Lease ended on ${end.toLocaleDateString()}.` }
  }
  if (start && start > today) {
    if ((lease.status || '').toLowerCase() === 'renewed') {
      return { status: 'renewed', detail: `Renewed lease starts on ${start.toLocaleDateString()}.` }
    }
    return { status: 'pending', detail: `Lease activates on ${start.toLocaleDateString()}.` }
  }
  return { status: lease.status || 'pending', detail: 'Lease data pending verification.' }
}

function parseDateOnly(value?: string | null) {
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

function toIsoDate(value: Date | null) {
  if (!value) return null
  return value.toISOString().slice(0, 10)
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function monthsBetweenUtc(start: Date, end: Date) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
}

function lastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0))
}

function addMonthsPreserveDayUtc(date: Date, months: number) {
  const startDay = date.getUTCDate()
  const rawMonth = date.getUTCMonth() + months
  const year = date.getUTCFullYear() + Math.floor(rawMonth / 12)
  const monthIndex = ((rawMonth % 12) + 12) % 12
  const lastDay = lastDayOfMonthUtc(year, monthIndex).getUTCDate()
  const day = Math.min(startDay, lastDay)
  return new Date(Date.UTC(year, monthIndex, day))
}

function formatDateLabel(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function deriveRenewalDates(start?: string | null, end?: string | null) {
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

export default function TenantLeaseManagementPage() {
  const params = useParams()
  const tenantIdParam = params?.tenantId
  const tenantId = Array.isArray(tenantIdParam) ? tenantIdParam[0] : tenantIdParam
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const backHref = returnTo && returnTo.startsWith('/dashboard') ? returnTo : '/dashboard/tenants'
  const backLabel = backHref === '/dashboard/tenants' ? 'Back to tenants' : 'Back to report'
  const vacateNoticeRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LeaseResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [renewal, setRenewal] = useState<LeaseRenewal | null>(null)
  const [renewalLoading, setRenewalLoading] = useState(false)
  const [renewalBusy, setRenewalBusy] = useState<null | 'create' | 'managerSign' | 'download'>(null)
  const [vacateNotice, setVacateNotice] = useState<VacateNotice | null>(null)
  const [vacateEvents, setVacateEvents] = useState<VacateEvent[]>([])
  const [vacateLoading, setVacateLoading] = useState(false)
  const [vacateError, setVacateError] = useState<string | null>(null)
  const [vacateActionBusy, setVacateActionBusy] = useState<null | 'ack' | 'approve' | 'reject' | 'complete' | 'download'>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [transitionBusy, setTransitionBusy] = useState(false)

  const [startDate, setStartDate] = useState('')
  const [durationMonths, setDurationMonths] = useState('12')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [depositAmount, setDepositAmount] = useState('')

  const leaseSummary = useMemo(() => data?.lease_status, [data])
  const tenant = data?.tenant
  const lease = data?.lease

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

  const displayLeaseStatus = useMemo(() => {
    if (!lease) return leaseSummary?.status || 'unassigned'
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
    return lease.status || leaseSummary?.status || 'pending'
  }, [effectiveEndDate, effectiveStartDate, lease, leaseSummary?.status, renewal?.status])

  const displayLeaseDetail = useMemo(() => {
    if (!lease) return leaseSummary?.detail || 'Lease status pending verification.'
    const start = effectiveStartDate ? new Date(effectiveStartDate) : null
    const end = effectiveEndDate ? new Date(effectiveEndDate) : null
    const today = new Date()
    const statusValue = (lease.status || '').toLowerCase()
    const isRenewed = statusValue === 'renewed' || renewal?.status === 'completed'

    if (start && start <= today && (!end || end >= today)) {
      return 'Lease is currently active.'
    }
    if (end && end < today) {
      return `Lease ended on ${end.toLocaleDateString()}.`
    }
    if (start && start > today) {
      return isRenewed
        ? `Renewed lease starts on ${start.toLocaleDateString()}.`
        : `Lease activates on ${start.toLocaleDateString()}.`
    }
    return leaseSummary?.detail || 'Lease status pending verification.'
  }, [effectiveEndDate, effectiveStartDate, lease, leaseSummary?.detail, renewal?.status])

  const refreshVacateNotice = useCallback(async (leaseId?: string | null) => {
    if (!leaseId) {
      setVacateNotice(null)
      setVacateEvents([])
      return
    }
    setVacateLoading(true)
    setVacateError(null)
    try {
      const response = await fetch(`/api/vacate-notices/by-lease?leaseId=${encodeURIComponent(leaseId)}`, {
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load vacate notice.')
      }
      setVacateNotice(payload.notice || null)
      setVacateEvents(payload.events || [])
    } catch (err) {
      console.error('[TenantLease] vacate notice fetch failed', err)
      setVacateError(err instanceof Error ? err.message : 'Unable to load vacate notice.')
    } finally {
      setVacateLoading(false)
    }
  }, [])

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
      console.warn('[ManagerLease] Failed to load renewal', e)
    } finally {
      setRenewalLoading(false)
    }
  }, [])

  const handleOpenTransition = useCallback(async () => {
    if (!vacateNotice?.id) return
    setTransitionBusy(true)
    try {
      const res = await fetch('/api/tenant-transitions/from-vacate-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notice_id: vacateNotice.id }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to open transition case.')
      }
      toast({
        title: 'Move-out case opened',
        description: 'Transition case created from this vacate notice.',
      })
      if (payload.caseId) {
        router.push(`/dashboard/manager/transitions/${payload.caseId}`)
      }
    } catch (err) {
      toast({
        title: 'Failed to open case',
        description: err instanceof Error ? err.message : 'Unable to create transition case.',
        variant: 'destructive',
      })
    } finally {
      setTransitionBusy(false)
    }
  }, [router, toast, vacateNotice?.id])

  const durationFromRange = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 12
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setSelectedFile(file || null)
  }

  const handleUpload = async () => {
    if (!tenantId || !selectedFile) return
    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('tenant_id', tenantId)
      if (data?.lease?.id) {
        formData.append('lease_id', data.lease.id)
      }

      const response = await fetch(`/api/tenants/${tenantId}/lease/upload`, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to upload document.')
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              lease: prev.lease ? { ...prev.lease, lease_agreement_url: payload.url } : prev.lease,
            }
          : prev
      )
      toast({
        title: 'Lease document uploaded',
        description: 'Tenants can now download the scanned lease in their portal.',
      })
      setSelectedFile(null)
    } catch (err) {
      console.error('[ManagerLease] upload failed', err)
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload lease document.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

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

  const handleVacateDownload = async () => {
    if (!vacateNotice?.id) return
    setVacateActionBusy('download')
    try {
      const res = await fetch(`/api/vacate-notices/${vacateNotice.id}/document`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Download unavailable.')
      }
      window.open(json.url, '_blank')
    } catch (err: any) {
      toast({
        title: 'Download failed',
        description: err?.message ?? 'Unable to download notice document.',
        variant: 'destructive',
      })
    } finally {
      setVacateActionBusy(null)
    }
  }

  const handleVacateAction = async (action: 'ack' | 'approve' | 'reject' | 'complete') => {
    if (!vacateNotice?.id) return
    if (action === 'reject' && !rejectReason.trim()) {
      setVacateError('Please add a rejection reason before rejecting.')
      return
    }
    setVacateActionBusy(action)
    setVacateError(null)
    try {
      const endpointMap: Record<typeof action, string> = {
        ack: 'acknowledge',
        approve: 'approve',
        reject: 'reject',
        complete: 'complete',
      }
      const body =
        action === 'reject'
          ? JSON.stringify({ manager_notes: rejectReason.trim() })
          : undefined
      const res = await fetch(`/api/vacate-notices/${vacateNotice.id}/${endpointMap[action]}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update vacate notice.')
      }
      toast({
        title: 'Vacate notice updated',
        description: 'The tenant has been notified.',
      })
      if (action === 'reject') {
        setRejectReason('')
      }
      await refreshVacateNotice(lease?.id || '')
    } catch (err: any) {
      setVacateError(err?.message ?? 'Failed to update vacate notice.')
    } finally {
      setVacateActionBusy(null)
    }
  }

  const loadLease = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/tenants/${tenantId}/lease?tenantId=${tenantId}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load lease data.')
      }
      const payload = await response.json()
      setData(payload.data)
      if (payload.data?.lease?.id) {
        refreshRenewal(payload.data.lease.id)
      }

      if (payload.data?.lease) {
        setStartDate(payload.data.lease.start_date || '')
        setDurationMonths(
          payload.data.lease.start_date && payload.data.lease.end_date
            ? durationFromRange(payload.data.lease.start_date, payload.data.lease.end_date).toString()
            : '12'
        )
        setMonthlyRent(payload.data.lease.monthly_rent?.toString() || '')
        setDepositAmount(payload.data.lease.deposit_amount?.toString() || '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load lease information.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, refreshRenewal])

  useEffect(() => {
    void loadLease()
  }, [loadLease])

  useEffect(() => {
    if (data?.lease?.id) {
      refreshVacateNotice(data.lease.id)
    }
  }, [data?.lease?.id, refreshVacateNotice])

  useEffect(() => {
    if (!lease?.id) return
    const refresh = () => refreshVacateNotice(lease.id)

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('vacate_notice_refresh')
      channel.onmessage = refresh
      return () => channel.close()
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'vacate_notice_refresh') refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [lease?.id, refreshVacateNotice])

  useEffect(() => {
    if (searchParams.get('tab') === 'vacate_notice') {
      vacateNoticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [searchParams])

  const handleSave = async () => {
    if (!tenantId) return
    if (!startDate || !durationMonths) {
      toast({
        title: 'Missing details',
        description: 'Start date and lease duration are required.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/tenants/${tenantId}/lease?tenantId=${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_user_id: tenantId,
          start_date: startDate,
          duration_months: Number(durationMonths),
          monthly_rent: monthlyRent ? Number(monthlyRent) : null,
          deposit_amount: depositAmount ? Number(depositAmount) : null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to update lease.')
      }

      const payload = await response.json()
      if (payload.data) {
        setData((current) =>
          current
            ? {
                ...current,
                lease: {
                  ...current.lease,
                  ...payload.data,
                },
                lease_status: summarizeLease(payload.data),
              }
            : current
        )
        setStartDate(payload.data.start_date || '')
        setDurationMonths(
          payload.data.start_date && payload.data.end_date
            ? durationFromRange(payload.data.start_date, payload.data.end_date).toString()
            : durationMonths
        )
        setMonthlyRent(payload.data.monthly_rent?.toString() || '')
        setDepositAmount(payload.data.deposit_amount?.toString() || '')
      }

      toast({ title: 'Lease updated', description: 'Lease terms saved successfully.' })
    } catch (err) {
      toast({
        title: 'Unable to update lease',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return 'KES 0'
    const numeric = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(numeric as number)) return 'KES 0'
    return currencyFormatter.format(Number(numeric))
  }

  const handleExport = () => {
    if (!tenant) {
      toast({
        title: 'Missing tenant',
        description: 'Load tenant details before exporting the lease.',
        variant: 'destructive',
      })
      return
    }

    const buildingLabel = lease?.unit?.building?.name
      ? `${lease.unit.building.name}${
          lease.unit.building.location ? ` • ${lease.unit.building.location}` : ''
        }`
      : 'Unassigned'
    const leasePeriod =
      effectiveStartDate && effectiveEndDate
        ? `${new Date(effectiveStartDate).toLocaleDateString()} – ${new Date(
            effectiveEndDate
          ).toLocaleDateString()}`
        : '—'

    const summary = [
      { label: 'Tenant', value: tenant.full_name || 'Tenant' },
      { label: 'Tenant ID', value: tenant.id },
      { label: 'Property', value: buildingLabel },
      { label: 'Unit', value: lease.unit?.unit_number || '—' },
      { label: 'Lease Period', value: leasePeriod },
      { label: 'Monthly Rent', value: formatCurrency(lease.monthly_rent) },
    ]

    const sections = [
      {
        title: 'Contact & Identification',
        rows: [
          { label: 'Phone', value: tenant.phone_number || '—' },
          { label: 'Address', value: tenant.address || '—' },
          { label: 'Lease ID', value: lease.id },
        ],
      },
      {
        title: 'Lease Terms',
        rows: [
          { label: 'Start Date', value: effectiveStartDate || startDate || '—' },
          { label: 'End Date', value: effectiveEndDate || '—' },
          { label: 'Deposit Amount', value: formatCurrency(lease.deposit_amount) },
          { label: 'Lease Status', value: displayLeaseStatus || lease.status || '—' },
          { label: 'Duration (months)', value: durationMonths },
        ],
      },
      {
        title: 'Unit & Building',
        rows: [
          { label: 'Property', value: buildingLabel },
          { label: 'Unit Category', value: lease.unit?.unit_price_category || '—' },
        ],
      },
    ]

    const notes = [
      'Use this summary when renewing, adjusting rent, or onboarding caretakers.',
      'Ensure prepaid rent schedules align with payment receipts before issuing new invoices.',
    ]

    void exportLeasePdf({
      fileName: `tenant-lease-${tenant.id}.pdf`,
      headerTitle: 'Manager Lease Summary',
      headerSubtitle: tenant.full_name || 'Tenant record',
      summary,
      sections,
      notes,
      letterhead: {
        tenantName: tenant.full_name || undefined,
        tenantPhone: tenant.phone_number || undefined,
        propertyName: buildingLabel || undefined,
        unitNumber: lease.unit?.unit_number || undefined,
        documentTitle: 'Manager Lease Summary',
      },
    })
  }

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Tenant id missing from URL.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Button>
          <h1 className="text-2xl font-bold">Lease Management</h1>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Lease Details</CardTitle>
                <CardDescription>Manage lease terms and validity for the tenant.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border p-3 bg-slate-50">
                  <Avatar className="h-12 w-12">
                    {tenant?.profile_picture_url ? (
                      <img src={tenant.profile_picture_url} alt={tenant.full_name || ''} />
                    ) : (
                      <AvatarFallback>
                        {(tenant?.full_name || 'TN')
                          .split(' ')
                          .map((chunk) => chunk[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="font-semibold text-lg">{tenant?.full_name || 'Tenant'}</p>
                    <p className="text-xs text-muted-foreground">{tenant?.address || tenant?.phone_number}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Start Date</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Lease Duration (months)
                    </label>
                    <Select value={durationMonths} onValueChange={(value) => setDurationMonths(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map((option) => (
                          <SelectItem key={option} value={option.toString()}>
                            {option} months
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Monthly Rent</label>
                    <Input
                      type="number"
                      min="0"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="KES"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Deposit Amount</label>
                    <Input
                      type="number"
                      min="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="KES"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Lease
                  </Button>
                  <Button variant="outline" onClick={handleExport} className="gap-2">
                    <Download className="h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lease Status</CardTitle>
                <CardDescription>Overview of the current lease record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-medium">{effectiveStartDate || 'Start date not set'}</p>
                    <p className="text-xs text-muted-foreground">Lease start date</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-medium">{effectiveEndDate || 'End date not set'}</p>
                    <p className="text-xs text-muted-foreground">Lease end date</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 bg-slate-50">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusBadgeClasses(
                      displayLeaseStatus
                    )}`}
                  >
                    {displayLeaseStatus || 'unassigned'}
                  </span>
                  <p className="text-xs text-muted-foreground">{displayLeaseDetail}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Lease Documents</CardTitle>
                <CardDescription>Upload a signed/ scanned lease for tenant access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border p-3 bg-slate-50">
                  <div>
                    <p className="font-semibold">Current file</p>
                    <p className="text-xs text-muted-foreground">
                      {data?.lease?.lease_agreement_url ? 'Tenant can download this file.' : 'No file uploaded yet.'}
                    </p>
                  </div>
                  {data?.lease?.lease_agreement_url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={data.lease.lease_agreement_url} target="_blank" rel="noreferrer" className="gap-2 flex items-center">
                        <Download className="h-4 w-4" />
                        View file
                      </a>
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Upload lease (PDF or image)</label>
                  <Input type="file" accept=".pdf,image/*" onChange={handleFileChange} />
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground">
                      Ready to upload: <span className="font-medium text-slate-900">{selectedFile.name}</span>
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                  className="w-full gap-2"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {uploading ? 'Uploading…' : 'Upload lease document'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Uploaded files are stored securely and exposed as a download link in the tenant portal’s lease page.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Lease Renewal
                </CardTitle>
                <CardDescription>Initiate and countersign lease renewals.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
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
                              description: 'Load tenant lease details before starting a renewal.',
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
                            toast({
                              title: 'Renewal initiated',
                              description: 'Tenant can now sign from their lease page.',
                            })
                          } catch (e: any) {
                            const msg = e?.message ?? 'Error'
                            toast({
                              title: 'Failed to start renewal',
                              description: msg,
                              variant: 'destructive',
                            })
                          } finally {
                            setRenewalBusy(null)
                          }
                        }}
                      >
                        Force Lease Renewal
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
                        <span className="inline-flex ml-2 rounded-md border px-2 py-0.5 text-xs font-medium">
                          {renewal.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
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
                        Unsigned
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
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
                        Tenant
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
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
                        Fully Signed
                      </Button>

                    </div>

                    <div className="pt-2 space-y-2">
                      {canStartRenewal && renewal.status === 'completed' ? (
                        <Button
                          variant="outline"
                          disabled={!lease?.id || lease.id === 'undefined' || renewalBusy === 'create'}
                          onClick={async () => {
                            if (!lease?.id) {
                              toast({
                                title: 'Lease unavailable',
                                description: 'Load tenant lease details before starting a renewal.',
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
                              toast({
                                title: 'Renewal initiated',
                                description: 'Tenant can now sign from their lease page.',
                              })
                            } catch (e: any) {
                              const msg = e?.message ?? 'Error'
                              toast({
                                title: 'Failed to start renewal',
                                description: msg,
                                variant: 'destructive',
                              })
                            } finally {
                              setRenewalBusy(null)
                            }
                          }}
                        >
                          Force Lease Renewal
                        </Button>
                      ) : null}
                      <Button
                        disabled={renewal.status !== 'in_progress' || renewalBusy === 'managerSign'}
                        onClick={async () => {
                          try {
                            setRenewalBusy('managerSign')
                            await managerSignRenewal(renewal.id)
                            await refreshRenewal(lease.id)
                            await loadLease()
                            toast({
                              title: 'Countersigned',
                              description: 'Renewal completed. Fully signed PDF is now available.',
                            })
                          } catch (e: any) {
                            toast({
                              title: 'Countersign failed',
                              description: e?.message ?? 'Error',
                              variant: 'destructive',
                            })
                          } finally {
                            setRenewalBusy(null)
                          }
                        }}
                      >
                        Countersign
                      </Button>

                      {renewal.status !== 'in_progress' && (
                        <div className="text-xs text-muted-foreground">
                          Countersign is enabled only after the tenant signs (status: in_progress).
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div ref={vacateNoticeRef} id="vacate-notice">
              <Card>
                <CardHeader>
                  <CardTitle>Vacate Notice</CardTitle>
                  <CardDescription>Review and action tenant vacation requests.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                {vacateLoading ? (
                  <div className="text-sm text-muted-foreground">Loading vacate notice…</div>
                ) : !vacateNotice ? (
                  <div className="text-sm text-muted-foreground">No vacate notice submitted.</div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${vacateStatusClasses(vacateNotice.status)}`}>
                        {(vacateNotice.status || 'submitted').toString()}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        Requested move-out: {formatDateLabel(vacateNotice.requested_vacate_date)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={vacateActionBusy === 'download'}
                        onClick={handleVacateDownload}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download notice
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={transitionBusy}
                        onClick={handleOpenTransition}
                      >
                        {transitionBusy ? 'Opening...' : 'Open Move-out Case'}
                      </Button>
                    </div>

                    {vacateNotice.manager_notes ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                        <p className="font-semibold">Manager notes</p>
                        <p className="mt-1">{vacateNotice.manager_notes}</p>
                      </div>
                    ) : null}

                    {vacateTimeline.length > 0 ? (
                      <div className="grid gap-2">
                        {vacateTimeline.map((step) => (
                          <div
                            key={`${step.label}-${step.date}`}
                            className="flex items-center justify-between rounded-md border p-2"
                          >
                            <span className="capitalize">{step.label.replace(/_/g, ' ')}</span>
                            <span className="text-muted-foreground">
                              {step.date ? new Date(step.date).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {vacateError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                        {vacateError}
                      </div>
                    )}

                    {['submitted', 'acknowledged'].includes(
                      String(vacateNotice.status || '').toLowerCase()
                    ) && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {String(vacateNotice.status || '').toLowerCase() === 'submitted' && (
                            <Button
                              size="sm"
                              onClick={() => handleVacateAction('ack')}
                              disabled={vacateActionBusy !== null}
                            >
                              Acknowledge
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleVacateAction('approve')}
                            disabled={vacateActionBusy !== null}
                          >
                            Approve
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Rejection reason
                          </label>
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Add reason (required to reject)"
                            rows={3}
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleVacateAction('reject')}
                            disabled={vacateActionBusy !== null}
                          >
                            Reject notice
                          </Button>
                        </div>
                      </div>
                    )}

                    {String(vacateNotice.status || '').toLowerCase() === 'approved' && (
                      <Button
                        size="sm"
                        onClick={() => handleVacateAction('complete')}
                        disabled={vacateActionBusy !== null}
                      >
                        Complete notice
                      </Button>
                    )}

                    {String(vacateNotice.status || '').toLowerCase() === 'completed' && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                        Vacate notice completed. Lease and unit status have been updated.
                      </div>
                    )}
                  </>
                )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Lease Notes</CardTitle>
                <CardDescription>Attach legal details or custom clauses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Leasing periods are available in 6 month increments up to 5 years. Use the export feature to
                  generate a printable PDF that can be shared with the tenant.
                </p>
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-xs">Exports use your browser’s PDF printer. Adjust settings as needed.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
