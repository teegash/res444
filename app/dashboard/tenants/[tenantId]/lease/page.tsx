'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, ArrowLeft, Download, Calendar, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { exportLeasePdf } from '@/lib/pdf/leaseDocument'

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

const durationOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 6)

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

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
    return { status: 'pending', detail: `Lease activates on ${start.toLocaleDateString()}.` }
  }
  return { status: lease.status || 'pending', detail: 'Lease data pending verification.' }
}

export default function TenantLeaseManagementPage() {
  const params = useParams()
  const tenantIdParam = params?.tenantId
  const tenantId = Array.isArray(tenantIdParam) ? tenantIdParam[0] : tenantIdParam
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LeaseResponse | null>(null)

  const [startDate, setStartDate] = useState('')
  const [durationMonths, setDurationMonths] = useState('12')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [depositAmount, setDepositAmount] = useState('')

  const leaseSummary = useMemo(() => data?.lease_status, [data])
  const tenant = data?.tenant
  const lease = data?.lease

  const durationFromRange = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 12
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
  }

  useEffect(() => {
    if (!tenantId) return
    const fetchLease = async () => {
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
    }
    fetchLease()
  }, [tenantId])

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
      lease.start_date && lease.end_date
        ? `${new Date(lease.start_date).toLocaleDateString()} – ${new Date(
            lease.end_date
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
          { label: 'Start Date', value: lease.start_date || startDate || '—' },
          { label: 'End Date', value: lease.end_date || '—' },
          { label: 'Deposit Amount', value: formatCurrency(lease.deposit_amount) },
          { label: 'Lease Status', value: lease.status || leaseSummary?.status || '—' },
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

    exportLeasePdf({
      fileName: `tenant-lease-${tenant.id}.pdf`,
      headerTitle: 'Manager Lease Summary',
      headerSubtitle: tenant.full_name || 'Tenant record',
      summary,
      sections,
      notes,
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
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/tenants')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to tenants
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
                    <p className="font-medium">{lease?.start_date || 'Start date not set'}</p>
                    <p className="text-xs text-muted-foreground">Lease start date</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-medium">{lease?.end_date || 'End date not set'}</p>
                    <p className="text-xs text-muted-foreground">Lease end date</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 bg-slate-50">
                  <p className="text-sm font-semibold capitalize">{leaseSummary?.status || 'unassigned'}</p>
                  <p className="text-xs text-muted-foreground">{leaseSummary?.detail}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
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
