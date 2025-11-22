'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, FileText, Calendar, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Switch } from '@/components/ui/switch'
import jsPDF from 'jspdf'

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

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return currencyFormatter.format(value)
}

const statusBadgeClasses = (status?: string | null) => {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'ended':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-gray-200 text-gray-700'
  }
}

export default function LeasePage() {
  const [lease, setLease] = useState<LeaseDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(false)
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false)
  const { toast } = useToast()

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
        setAutoRenewEnabled(Boolean(payload.data?.lease_auto_generated))
      } catch (err) {
        console.error('[LeasePage] fetch failed', err)
        setError(err instanceof Error ? err.message : 'Unable to load lease info.')
      } finally {
        setLoading(false)
      }
    }

    fetchLease()
  }, [])

  const propertyName = lease?.unit?.building?.name || '—'
  const propertyLocation = lease?.unit?.building?.location || '—'
  const unitLabel = lease?.unit?.unit_number || '—'
  const leasePeriod = lease ? `${formatDate(lease.start_date)} – ${formatDate(lease.end_date)}` : '—'
  const monthlyRent = formatCurrency(lease?.monthly_rent)
  const depositAmount = formatCurrency(lease?.deposit_amount)
  const leaseStatus = lease?.status || 'Unknown'
  const agreementUrl = lease?.lease_agreement_url || ''

  const renewalInfo = useMemo(() => {
    if (!lease?.end_date) {
      return {
        message: 'No lease end date on file. Contact management for renewal information.',
        highlight: false,
      }
    }
    const end = new Date(lease.end_date)
    const now = new Date()
    const diffDays = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (Number.isNaN(diffDays)) {
      return {
        message: `Your lease expires on ${formatDate(lease.end_date)}.`,
        highlight: false,
      }
    }
    if (diffDays < 0) {
      return {
        message: `This lease expired on ${formatDate(lease.end_date)}.`,
        highlight: true,
      }
    }
    if (diffDays <= 60) {
      return {
        message: `Your lease expires on ${formatDate(lease.end_date)}. You can renew any time within the next ${diffDays} days.`,
        highlight: true,
      }
    }
    return {
      message: `Your lease expires on ${formatDate(lease.end_date)}. Renewal will open ${60} days before expiration.`,
      highlight: false,
    }
  }, [lease?.end_date])

  const generatePdf = useCallback(() => {
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
          { label: 'Start Date', value: formatDate(lease.start_date) },
          { label: 'End Date', value: formatDate(lease.end_date) },
          { label: 'Monthly Rent', value: monthlyRent },
          { label: 'Deposit Amount', value: depositAmount },
          { label: 'Auto Renewal', value: autoRenewEnabled ? 'Enabled' : 'Disabled' },
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
          { label: 'Last Updated', lease.updated_at ? formatDate(lease.updated_at) : '—' },
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

    exportLeasePdf({
      fileName: 'lease-agreement.pdf',
      headerTitle: 'Tenant Lease Agreement',
      headerSubtitle: 'Certified tenant portal copy',
      summary,
      sections,
      notes,
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
    autoRenewEnabled,
    agreementUrl,
    toast,
  ])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      generatePdf()
    } finally {
      setDownloading(false)
    }
  }

  const handleAutoRenewToggle = async (enabled: boolean) => {
    try {
      setTogglingAutoRenew(true)
      const response = await fetch('/api/tenant/lease/auto-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update auto-renew preference.')
      }
      setAutoRenewEnabled(enabled)
      toast({
        title: `Auto-renew ${enabled ? 'enabled' : 'disabled'}`,
        description: 'Your lease renewal preference has been saved.',
      })
    } catch (err) {
      console.error('[LeasePage] auto-renew toggle failed', err)
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update auto-renew.',
        variant: 'destructive',
      })
    } finally {
      setTogglingAutoRenew(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/30 via-white to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold">Lease Agreement</h1>
          </div>
          <div className="ml-auto flex gap-2">
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
          </div>
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
                  <p className="text-muted-foreground">{formatDate(lease?.start_date)}</p>
                </div>
                <Badge variant="outline">start</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div>
                  <p className="font-medium">Lease end</p>
                  <p className="text-muted-foreground">{formatDate(lease?.end_date)}</p>
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
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium">Auto-renew lease</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically extend your lease unless you opt out.
                  </p>
                </div>
                <Switch
                  checked={autoRenewEnabled}
                  onCheckedChange={handleAutoRenewToggle}
                  disabled={!lease || togglingAutoRenew}
                />
              </div>
              <Link href="/dashboard/tenant/messages">
                <Button variant="outline">Contact Property Manager</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

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
