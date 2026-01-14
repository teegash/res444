'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  exportRowsAsCSV,
  exportRowsAsExcel,
  exportRowsAsPDF,
  ExportColumn,
} from '@/lib/export/download'
import { downloadReceiptPdf } from '@/lib/payments/receiptPdf'

type TenantPaymentRecord = {
  id: string
  invoice_id: string | null
  amount_paid: number
  payment_method: string | null
  verified: boolean
  status: string
  created_at: string | null
  posted_at: string | null
  mpesa_receipt_number?: string | null
  bank_reference_number?: string | null
  months_paid: number
  invoice_type: string | null
  payment_type: string | null
  due_date: string | null
  property_name: string | null
  unit_label: string | null
}

type TenantInvoiceRecord = {
  id: string
  amount: number
  due_date: string | null
  status: boolean
  invoice_type: string | null
  description: string | null
  months_covered: number
  property_name: string | null
  unit_label: string | null
  raw_status?: string | null
  is_covered?: boolean
}

type TenantSummaryPayload = {
  profile: {
    full_name: string | null
    phone_number: string | null
    address: string | null
  } | null
  lease: {
    id: string
    unit_label: string | null
    property_name: string | null
    property_location: string | null
  } | null
}

type PendingInvoice = {
  id: string
  due_date: string | null
  amount: number
}

type ReceiptDetails = {
  payment: {
    id: string
    amount: number
    method: string | null
    status: string
    created_at: string | null
    payment_date: string | null
    mpesa_receipt_number: string | null
    bank_reference_number: string | null
    notes: string | null
    months_paid: number
    coverage_label: string
  }
  invoice: {
    id: string
    type: string | null
    amount: number
    due_date: string | null
    description: string | null
  } | null
  property: {
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  tenant: {
    name: string
    phone_number: string | null
    address: string | null
  }
}

export default function PaymentHistoryPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<TenantPaymentRecord[]>([])
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterMethod, setFilterMethod] = useState<string>('all')
  const [searchMonth, setSearchMonth] = useState('')
  const [upcomingInvoice, setUpcomingInvoice] = useState<(PendingInvoice & { status?: string; isCovered?: boolean }) | null>(null)
  const [tenantSummary, setTenantSummary] = useState<TenantSummaryPayload | null>(null)
  const [exporting, setExporting] = useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetails | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash === '#upcoming-payments') {
      document.getElementById('upcoming-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true)
      const [paymentsResp, invoicesResp, summaryResp] = await Promise.all([
        fetch('/api/tenant/payments', { cache: 'no-store' }),
        fetch('/api/tenant/invoices', { cache: 'no-store' }),
        fetch('/api/tenant/summary', { cache: 'no-store' }),
      ])

      if (!paymentsResp.ok) {
        const payload = await paymentsResp.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load payments.')
      }
      const paymentsPayload = await paymentsResp.json()
      setPayments(paymentsPayload.data || [])

      if (invoicesResp.ok) {
        const invoicesPayload = await invoicesResp.json().catch(() => ({}))
        const normalized: TenantInvoiceRecord[] = (invoicesPayload.data || []).map((invoice: any) => ({
          id: invoice.id,
          amount: Number(invoice.amount),
          due_date: invoice.due_date,
          status: Boolean(invoice.status),
          invoice_type: invoice.invoice_type,
          description: invoice.description,
          months_covered: Number(invoice.months_covered || 0),
          property_name: invoice.property_name || null,
          unit_label: invoice.unit_label || null,
          raw_status: invoice.raw_status,
          is_covered: Boolean(invoice.is_covered || invoice.is_prestart),
        }))
        setInvoices(normalized)
        const nextPending = normalized.find((invoice) => {
          if (invoice.is_covered) return false
          const raw = (invoice as any).raw_status
          if (raw && typeof raw === 'string') {
            const lowered = raw.toLowerCase()
            if (['pending', 'partially_paid', 'overdue'].includes(lowered)) return true
          }
          return !invoice.status
        })
        if (nextPending) {
          setUpcomingInvoice({
            id: nextPending.id,
            due_date: nextPending.due_date,
            amount: nextPending.amount,
            status: (nextPending as any).raw_status || 'unpaid',
            isCovered: nextPending.is_covered || false,
          })
        } else {
          setUpcomingInvoice(null)
        }
      } else {
        setInvoices([])
        setUpcomingInvoice(null)
      }

      if (summaryResp.ok) {
        const summaryPayload = await summaryResp.json().catch(() => ({}))
        setTenantSummary(summaryPayload.data || null)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const handleOpenStatement = () => {
    const leaseId = tenantSummary?.lease?.id || ''
    const qs = new URLSearchParams()
    if (leaseId) qs.set('leaseId', leaseId)
    router.push(`/dashboard/tenant/statement${qs.toString() ? `?${qs.toString()}` : ''}`)
  }

  const handleOpenReceipt = async (paymentId?: string | null) => {
    setReceiptModalOpen(true)
    setReceiptError(null)
    setReceiptDetails(null)

    if (!paymentId || paymentId === 'undefined' || paymentId === 'null') {
      setReceiptLoading(false)
      setReceiptError('Receipt is unavailable for this payment.')
      return
    }

    setReceiptLoading(true)
    try {
      const response = await fetch(`/api/tenant/receipts/${paymentId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load receipt.')
      }
      setReceiptDetails(payload.data)
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : 'Failed to load receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const handleCloseReceipt = () => {
    setReceiptModalOpen(false)
    setReceiptDetails(null)
    setReceiptError(null)
  }

  const paymentStats = useMemo(() => {
    const monthsWindow = 6
    const now = new Date()
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsWindow - 1), 1))

    const verifiedPayments = payments.filter((payment) => payment.verified)
    const recentPayments = verifiedPayments.filter((payment) => {
      const paidBasis = payment.posted_at || payment.created_at
      if (!paidBasis) return false
      const paidDate = new Date(paidBasis)
      return paidDate >= rangeStart
    })

    const totalPaid = recentPayments.reduce((sum, payment) => sum + payment.amount_paid, 0)

    const monthsWithPayments = new Set(
      recentPayments
        .map((payment) => payment.posted_at || payment.created_at)
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          const paidDate = new Date(value)
          return `${paidDate.getUTCFullYear()}-${String(paidDate.getUTCMonth() + 1).padStart(2, '0')}`
        })
    )

    const eligibleForOnTime = recentPayments.filter((payment) => payment.due_date && (payment.posted_at || payment.created_at))
    const onTimeCount = eligibleForOnTime.filter((payment) => {
      const paidBasis = payment.posted_at || payment.created_at
      if (!paidBasis || !payment.due_date) return false
      const paidDate = new Date(paidBasis)
      const dueDate = new Date(payment.due_date)
      const graceDate = new Date(dueDate)
      graceDate.setDate(graceDate.getDate() + 5)
      return paidDate <= graceDate
    }).length

    const averageMonthly =
      monthsWithPayments.size > 0 ? Math.round(totalPaid / monthsWithPayments.size) : 0
    const onTimeRate =
      eligibleForOnTime.length > 0 ? Math.round((onTimeCount / eligibleForOnTime.length) * 100) : 0

    return {
      hasSixMonths: recentPayments.length > 0,
      totalPaid,
      onTimeRate,
      averageMonthly,
    }
  }, [payments])

  const { hasSixMonths, totalPaid: totalPaidLastSix, onTimeRate, averageMonthly } = paymentStats

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (filterMethod !== 'all' && payment.payment_method !== filterMethod) return false
      if (searchMonth) {
        const label = payment.due_date
          ? new Date(payment.due_date).toLocaleDateString(undefined, { month: 'long' }).toLowerCase()
          : payment.posted_at
            ? new Date(payment.posted_at).toLocaleDateString(undefined, { month: 'long' }).toLowerCase()
            : ''
        if (!label.includes(searchMonth.toLowerCase())) return false
      }
      return true
    })
  }, [payments, filterMethod, searchMonth])

  const formatCoveragePeriod = useCallback((dueDate: string | null, monthsCovered: number) => {
    if (!dueDate) {
      return monthsCovered > 1 ? `${monthsCovered} months` : 'Current month'
    }
    const start = new Date(dueDate)
    if (Number.isNaN(start.getTime())) {
      return monthsCovered > 1 ? `${monthsCovered} months` : start.toLocaleDateString()
    }

    if (monthsCovered <= 1) {
      return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }

    const end = new Date(start)
    end.setMonth(end.getMonth() + monthsCovered - 1)
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    const endLabel = end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    return `${startLabel} – ${endLabel}`
  }, [])

  const tenantName = tenantSummary?.profile?.full_name || 'Tenant'
  const propertyLabel = tenantSummary?.lease?.unit_label
    ? `${tenantSummary.lease.unit_label}`
    : 'My Lease'

  type ExportRow = TenantPaymentRecord & { isTotalRow?: boolean }

  const exportablePayments = useMemo(
    () => filteredPayments.filter((payment) => payment.verified),
    [filteredPayments]
  )

  const totalAmountPaid = useMemo(
    () => exportablePayments.reduce((sum, payment) => sum + payment.amount_paid, 0),
    [exportablePayments]
  )

  const exportColumns: ExportColumn<ExportRow>[] = [
    {
      header: 'Period',
      accessor: (payment) => {
        if (payment.isTotalRow) {
          return 'TOTAL'
        }
        if (payment.due_date) {
          return new Date(payment.due_date).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })
        }
        return payment.posted_at ? new Date(payment.posted_at).toLocaleDateString() : 'Payment'
      },
    },
    {
      header: 'Type',
      accessor: (payment) => (payment.payment_type || payment.invoice_type || 'rent').toUpperCase(),
    },
    {
      header: 'Debit (KES)',
      accessor: () => '',
    },
    {
      header: 'Credit (KES)',
      accessor: (payment) =>
        payment.amount_paid ? `KES ${payment.amount_paid.toLocaleString()}` : '',
    },
    {
      header: 'Method',
      accessor: (payment) =>
        payment.isTotalRow ? '' : (payment.payment_method || 'UNKNOWN').toUpperCase(),
    },
    {
      header: 'Status',
      accessor: (payment) => (payment.isTotalRow ? '' : payment.status),
    },
    {
      header: 'Reference',
      accessor: (payment) =>
        payment.isTotalRow
          ? ''
          : payment.mpesa_receipt_number || payment.bank_reference_number || payment.invoice_id || payment.id,
    },
    {
      header: 'Recorded On',
      accessor: (payment) =>
        payment.posted_at
          ? new Date(payment.posted_at).toLocaleDateString()
          : payment.created_at
            ? new Date(payment.created_at).toLocaleDateString()
            : '',
    },
  ]

  const handleExport = async (format: 'pdf' | 'csv' | 'excel') => {
    setExporting(true)
    const fileBase = `tenant-payments-${tenantName.replace(/\s+/g, '-').toLowerCase()}`
    const subtitle = `${tenantName} • ${propertyLabel}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = {
      tenantName,
      tenantPhone: tenantSummary?.profile?.phone_number || undefined,
      propertyName: tenantSummary?.lease?.property_name || undefined,
      unitNumber: tenantSummary?.lease?.unit_label || undefined,
      documentTitle: 'Payment History',
      generatedAtISO,
    }
    const rows: ExportRow[] = [
      ...exportablePayments,
      {
        id: '__total__',
        invoice_id: null,
        amount_paid: totalAmountPaid,
        payment_method: null,
        verified: true,
        status: 'total',
        created_at: null,
        posted_at: null,
        mpesa_receipt_number: null,
        bank_reference_number: null,
        months_paid: 0,
        invoice_type: null,
        payment_type: null,
        due_date: null,
        property_name: null,
        unit_label: null,
        isTotalRow: true,
      },
    ]
    try {
      switch (format) {
        case 'pdf':
          await exportRowsAsPDF(fileBase, exportColumns, rows, {
            title: 'Payment History',
            subtitle,
            footerNote: `Generated on ${new Date().toLocaleString()}`,
            letterhead,
          })
          break
        case 'csv':
          await exportRowsAsCSV(fileBase, exportColumns, rows, undefined, { letterhead })
          break
        case 'excel':
          await exportRowsAsExcel(fileBase, exportColumns, rows, undefined, { letterhead })
          break
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Link href="/dashboard/tenant" className="order-1 md:order-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="order-2 ml-auto md:order-3 md:ml-auto"
                variant="outline"
                size="sm"
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')}>
                Download Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Download CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="order-3 w-full md:order-2 md:w-auto flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Payment History</h1>
          </div>
        </div>

        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {loading ? (
            <>
              <Card>
                <CardHeader className="pb-3 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-8 w-48" />
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-8 w-32" />
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3 space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-8 w-52" />
                </CardHeader>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Total Paid (Last 6 months)</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {hasSixMonths && totalPaidLastSix !== null
                      ? `KES ${totalPaidLastSix.toLocaleString()}`
                      : 'Not enough history'}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>On-time Payment Rate</CardDescription>
                  <CardTitle className="text-3xl text-blue-600">
                    {hasSixMonths && onTimeRate !== null ? `${onTimeRate}%` : 'Not enough history'}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Avg. Monthly Payment</CardDescription>
                  <CardTitle className="text-3xl text-purple-600">
                    {hasSixMonths && averageMonthly !== null
                      ? `KES ${averageMonthly.toLocaleString()}`
                      : 'Not enough history'}
                  </CardTitle>
                </CardHeader>
              </Card>
            </>
          )}
        </div>

        {/* Upcoming Payments */}
        <Card id="upcoming-payments">
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Your next rent payments</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingInvoice ? (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-semibold">
                    {upcomingInvoice.due_date
                      ? new Date(upcomingInvoice.due_date).toLocaleDateString(undefined, {
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Next Rent'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Due: {upcomingInvoice.due_date ? new Date(upcomingInvoice.due_date).toLocaleDateString() : 'Soon'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold">KES {upcomingInvoice.amount.toLocaleString()}</p>
                    <Badge variant="outline">
                      {upcomingInvoice.status && upcomingInvoice.status.toLowerCase() !== 'unpaid'
                        ? upcomingInvoice.status
                        : 'Due'}
                    </Badge>
                  </div>
                  <Link href={`/dashboard/tenant/payment?intent=rent&invoiceId=${upcomingInvoice.id}`}>
                    <Button>Pay Now</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You have no pending rent invoices right now.</p>
            )}
          </CardContent>
        </Card>

        {/* Account Statements */}
        <Card>
          <CardHeader>
            <CardTitle>Account Statements</CardTitle>
            <CardDescription>Your recent statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 p-4 border rounded-lg hover:bg-gray-100 transition-colors md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Full account statement</p>
                  <p className="text-sm text-muted-foreground">
                    Charges, payments, and running balance (matches the manager view).
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleOpenStatement} className="w-full md:w-auto">
                <FileText className="h-4 w-4 mr-2" />
                View Statement
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Input
                placeholder="Search by month..."
                value={searchMonth}
                onChange={(event) => setSearchMonth(event.target.value)}
              />
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={fetchPayments}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>All your rent payment records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading payments…</p>
            ) : filteredPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments match your filters.</p>
            ) : (
              filteredPayments.map((payment) => {
                const labelDate = payment.due_date
                  ? new Date(payment.due_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                  : payment.posted_at
                    ? new Date(payment.posted_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                    : 'Payment'

                const reference =
                  payment.payment_method === 'mpesa'
                    ? payment.mpesa_receipt_number
                    : payment.payment_method === 'bank_transfer'
                      ? payment.bank_reference_number
                      : payment.invoice_id

                const badgeClass =
                  payment.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : payment.status === 'verified'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'

                const badgeLabel =
                  payment.status === 'failed'
                    ? 'Failed'
                    : payment.status === 'verified'
                      ? 'Paid'
                      : 'Pending'

                return (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-4 p-4 border rounded-lg hover:bg-gray-100 transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                      <div className="p-2 bg-green-100 rounded">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{labelDate}</p>
                        <p className="text-sm text-muted-foreground break-words">
                          {(payment.payment_method || 'Unknown').replace('_', ' ').toUpperCase()} • Ref:{' '}
                          {reference || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize break-words">
                          {payment.property_name || 'Property'} {payment.unit_label ? `· ${payment.unit_label}` : ''} •{' '}
                          {(payment.payment_type || payment.invoice_type || 'rent').replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="text-left sm:text-right">
                        <p className="font-bold">KES {payment.amount_paid.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.posted_at ? new Date(payment.posted_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <Badge className={badgeClass}>{badgeLabel}</Badge>
                      <Button variant="outline" size="sm" onClick={() => handleOpenReceipt(payment.id)}>
                        <FileText className="h-4 w-4 mr-2" />
                        View Receipt
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={receiptModalOpen} onOpenChange={(open) => (!open ? handleCloseReceipt() : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription>Your official proof of payment.</DialogDescription>
          </DialogHeader>
          {receiptLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading receipt…</div>
          ) : receiptError ? (
            <div className="py-6 text-center text-sm text-red-600">{receiptError}</div>
          ) : receiptDetails ? (
            (() => {
              const isSuccess = receiptDetails.payment.status === 'verified'
              const accentBg = isSuccess ? 'bg-emerald-50' : 'bg-red-50'
              const accentText = isSuccess ? 'text-emerald-700' : 'text-red-700'
              return (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => void downloadReceiptPdf(receiptDetails)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                  <div className={`p-4 rounded-lg ${accentBg} ${accentText}`}>
                    <p className="text-sm uppercase tracking-wide font-semibold">
                      {isSuccess ? 'Payment Successful' : 'Payment Failed'}
                    </p>
                    <p className="text-2xl font-bold">
                      KES {receiptDetails.payment.amount.toLocaleString()}
                    </p>
                    <p className="text-xs mt-1">
                      {receiptDetails.payment.payment_date
                        ? new Date(receiptDetails.payment.payment_date).toLocaleString()
                        : ''}
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Tenant</p>
                      <p className="font-semibold">{receiptDetails.tenant.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground mb-1">Reference</p>
                      <p className="font-mono font-semibold break-all">
                        {receiptDetails.payment.mpesa_receipt_number ||
                          receiptDetails.payment.bank_reference_number ||
                          receiptDetails.payment.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Property</p>
                      <p className="font-semibold">
                        {receiptDetails.property?.property_name || 'My Unit'}
                        {receiptDetails.property?.unit_number
                          ? ` • ${receiptDetails.property.unit_number}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground mb-1">Coverage</p>
                      <p className="font-semibold">{receiptDetails.payment.coverage_label}</p>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden text-sm">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-semibold">Description</th>
                          <th className="text-right p-3 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            {receiptDetails.invoice?.description ||
                              (receiptDetails.invoice?.type === 'water'
                                ? 'Water bill payment'
                                : 'Rent payment')}
                          </td>
                          <td className="p-3 text-right font-semibold">
                            KES {receiptDetails.payment.amount.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className={`${accentBg} ${accentText} rounded-lg p-4 text-center text-sm`}>
                    {isSuccess ? (
                      <>
                        <p className="font-semibold">Thank you for keeping your payments up to date!</p>
                        <p>Need help? Reach us at support@res.co.ke</p>
                      </>
                    ) : (
                      <p className="font-semibold">
                        This payment did not go through. Please try again or contact support.
                      </p>
                    )}
                  </div>
                </div>
              )
            })()
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
