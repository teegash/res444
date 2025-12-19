'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
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
  period_start?: string | null
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

type StatementDetails = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  property: {
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  summary: {
    openingBalance: number
    totalCharges: number
    totalPayments: number
    closingBalance: number
  }
  transactions: Array<{
    id: string
    type: 'charge' | 'payment'
    description: string
    reference: string | null
    amount: number
    posted_at: string | null
    balance_after: number
    coverage_label?: string | null
  }>
  coverage?: {
    rent_paid_until: string | null
    coverage_label: string | null
  }
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
  const [payments, setPayments] = useState<TenantPaymentRecord[]>([])
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterMethod, setFilterMethod] = useState<string>('all')
  const [searchMonth, setSearchMonth] = useState('')
  const [upcomingInvoice, setUpcomingInvoice] = useState<(PendingInvoice & { status?: string; isCovered?: boolean }) | null>(null)
  const [tenantSummary, setTenantSummary] = useState<TenantSummaryPayload | null>(null)
  const [exporting, setExporting] = useState(false)
  const [statementModalOpen, setStatementModalOpen] = useState(false)
  const [statementDetails, setStatementDetails] = useState<StatementDetails | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [statementError, setStatementError] = useState<string | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetails | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)

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

  const handleOpenStatement = async (monthKey?: string | null) => {
    setStatementModalOpen(true)
    setStatementError(null)
    setStatementDetails(null)

    if (!monthKey) {
      setStatementLoading(false)
      setStatementError('Statement is unavailable for this invoice.')
      return
    }

    setStatementLoading(true)
    try {
      const response = await fetch(`/api/tenant/statements/month/${monthKey}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load statement.')
      }
      setStatementDetails(payload.data)
    } catch (error) {
      setStatementError(error instanceof Error ? error.message : 'Failed to load statement.')
    } finally {
      setStatementLoading(false)
    }
  }

  const handleCloseStatement = () => {
    setStatementModalOpen(false)
    setStatementDetails(null)
    setStatementError(null)
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
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const monthlyTotals = new Map<string, { total: number; onTime: boolean }>()
    payments.forEach((payment) => {
      if (!payment.verified) {
        return
      }
      const paidBasis = payment.posted_at || payment.created_at
      if (!paidBasis) return
      const paidDate = new Date(paidBasis)
      if (paidDate < sixMonthsAgo) {
        return
      }

      const monthKey = `${paidDate.getUTCFullYear()}-${paidDate.getUTCMonth()}`
      const entry = monthlyTotals.get(monthKey) || { total: 0, onTime: false }
      entry.total += payment.amount_paid

      if (payment.due_date) {
        const dueDate = new Date(payment.due_date)
        const graceDate = new Date(dueDate)
        graceDate.setDate(graceDate.getDate() + 5)
        if (paidDate <= graceDate) {
          entry.onTime = true
        }
      }

      monthlyTotals.set(monthKey, entry)
    })

    const hasSixMonths = monthlyTotals.size >= 6
    if (!hasSixMonths) {
      return {
        hasSixMonths: false,
        totalPaid: null,
        onTimeRate: null,
        averageMonthly: null,
      }
    }

    const totalPaid = Array.from(monthlyTotals.values()).reduce((sum, month) => sum + month.total, 0)
    const averageMonthly =
      monthlyTotals.size > 0 ? Math.round(totalPaid / monthlyTotals.size) : null
    const onTimeRate =
      monthlyTotals.size > 0
        ? Math.round(
            (Array.from(monthlyTotals.values()).filter((month) => month.onTime).length /
              monthlyTotals.size) *
              100
          )
        : null

    return {
      hasSixMonths: true,
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
        const monthSource = payment.period_start || payment.due_date || null
        const label = monthSource
          ? new Date(monthSource).toLocaleDateString(undefined, { month: 'long' }).toLowerCase()
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

  type MonthlyStatement = {
    monthKey: string
    periodLabel: string
    dateLabel: string
    amount: number
  }

  const statementSummaries: MonthlyStatement[] = useMemo(() => {
    const summaries: MonthlyStatement[] = []

    const paymentsByMonth = payments.reduce((acc, payment) => {
      if (!payment.verified || !payment.posted_at) return acc
      const date = new Date(payment.posted_at)
      if (Number.isNaN(date.getTime())) return acc
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      const bucket = acc.get(key) || { amount: 0, date }
      bucket.amount += payment.amount_paid
      bucket.date = date
      acc.set(key, bucket)
      return acc
    }, new Map<string, { amount: number; date: Date }>())

    const sortedKeys = Array.from(paymentsByMonth.keys()).sort((a, b) => (a > b ? -1 : 1))
    sortedKeys.slice(0, 6).forEach((key) => {
      const { amount, date } = paymentsByMonth.get(key)!
      summaries.push({
        monthKey: key,
        periodLabel: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        dateLabel: date.toLocaleDateString(),
        amount,
      })
    })

    return summaries
  }, [payments])

  const tenantName = tenantSummary?.profile?.full_name || 'Tenant'
  const propertyLabel = tenantSummary?.lease?.unit_label
    ? `${tenantSummary.lease.unit_label}`
    : 'My Lease'

  type ExportRow = TenantPaymentRecord & { isTotalRow?: boolean }

  const totalAmountPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.amount_paid, 0),
    [payments]
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

  const handleExport = (format: 'pdf' | 'csv' | 'excel') => {
    setExporting(true)
    const fileBase = `tenant-payments-${tenantName.replace(/\s+/g, '-').toLowerCase()}`
    const subtitle = `${tenantName} • ${propertyLabel}`
    const rows: ExportRow[] = [
      ...payments,
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
          exportRowsAsPDF(fileBase, exportColumns, rows, {
            title: 'Payment History',
            subtitle,
            footerNote: `Generated on ${new Date().toLocaleString()}`,
          })
          break
        case 'csv':
          exportRowsAsCSV(fileBase, exportColumns, rows)
          break
        case 'excel':
          exportRowsAsExcel(fileBase, exportColumns, rows)
          break
      }
    } finally {
      setTimeout(() => setExporting(false), 300)
    }
  }

  const handleStatementExport = (format: 'pdf' | 'excel') => {
    if (!statementDetails) return
    const columns: ExportColumn<{
      date: string
      description: string
      reference: string
      debit: string
      credit: string
      balance: string
    }>[] = [
      { header: 'Date', accessor: (row) => row.date },
      { header: 'Description', accessor: (row) => row.description },
      { header: 'Reference', accessor: (row) => row.reference },
      { header: 'Debit', accessor: (row) => row.debit },
      { header: 'Credit', accessor: (row) => row.credit },
      { header: 'Balance', accessor: (row) => row.balance },
    ]
    const rows = statementDetails.transactions.map((txn) => ({
      date: txn.posted_at ? new Date(txn.posted_at).toLocaleDateString() : '—',
      description: txn.description,
      reference: txn.reference || '—',
      debit: txn.amount > 0 ? `KES ${Math.abs(txn.amount).toLocaleString()}` : '',
      credit: txn.amount < 0 ? `KES ${Math.abs(txn.amount).toLocaleString()}` : '',
      balance: `KES ${txn.balance_after.toLocaleString()}`,
    }))
    const fileBase = `statement-${statementDetails.periodLabel.replace(/\s+/g, '-')}`
    if (format === 'pdf') {
      exportRowsAsPDF(fileBase, columns, rows, {
        title: 'Account Statement',
        subtitle: statementDetails.periodLabel,
        footerNote: `Generated on ${new Date().toLocaleString()}`,
      })
    } else {
      exportRowsAsExcel(fileBase, columns, rows)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Payment History</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="ml-auto" variant="outline" size="sm" disabled={exporting}>
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
        </div>

        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Paid (Last 6 months)</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {hasSixMonths && totalPaidLastSix !== null ? `KES ${totalPaidLastSix.toLocaleString()}` : 'Not enough history'}
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
                {hasSixMonths && averageMonthly !== null ? `KES ${averageMonthly.toLocaleString()}` : 'Not enough history'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Upcoming Payments */}
        <Card>
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
            {statementSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No statements generated yet.</p>
            ) : (
              statementSummaries.map((statement) => (
                <div
                  key={statement.monthKey}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Statement: {statement.periodLabel}</p>
                      <p className="text-sm text-muted-foreground">
                        Verified payments for {statement.dateLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-semibold text-green-600">
                      KES {statement.amount.toLocaleString()}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => handleOpenStatement(statement.monthKey)}>
                      <FileText className="h-4 w-4 mr-2" />
                      View Statement
                    </Button>
                  </div>
                </div>
              ))
            )}
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
                const monthSource = payment.period_start || payment.due_date || null
                const labelDate = monthSource
                  ? new Date(monthSource).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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
                  <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-green-100 rounded">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{labelDate}</p>
                        <p className="text-sm text-muted-foreground">
                          {(payment.payment_method || 'Unknown').replace('_', ' ').toUpperCase()} • Ref:{' '}
                          {reference || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {payment.property_name || 'Property'} {payment.unit_label ? `· ${payment.unit_label}` : ''} •{' '}
                          {(payment.payment_type || payment.invoice_type || 'rent').replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
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

      <Dialog open={statementModalOpen} onOpenChange={(open) => (!open ? handleCloseStatement() : null)}>
        <DialogContent className="w-[94vw] max-w-[1400px] lg:max-w-[1200px] border border-slate-100 shadow-2xl p-0">
          <div className="flex flex-col max-h-[70vh]">
            <DialogHeader className="flex flex-col gap-3 p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <DialogTitle>Account Statement</DialogTitle>
                  <DialogDescription>Detailed breakdown of the selected invoice.</DialogDescription>
                  {statementDetails?.coverage?.coverage_label ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Rent covered through {statementDetails.coverage.coverage_label}
                    </p>
                  ) : null}
                </div>
                {statementDetails && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleStatementExport('pdf')}>
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleStatementExport('excel')}>
                      Excel
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {statementLoading ? (
                <div className="py-10 text-center text-muted-foreground">Loading statement…</div>
              ) : statementError ? (
                <div className="py-6 text-center text-sm text-red-600">{statementError}</div>
              ) : statementDetails ? (
                <>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Statement Period</p>
                      <p className="font-semibold">{statementDetails.periodLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(statementDetails.periodStart).toLocaleDateString()} –{' '}
                        {new Date(statementDetails.periodEnd).toLocaleDateString()}
                      </p>
                    </div>
                <div className="text-right">
                  <p className="text-muted-foreground mb-1">Closing Balance</p>
                  <p
                    className={
                      statementDetails.summary.closingBalance < 0
                        ? 'font-semibold text-green-700'
                        : 'font-semibold text-red-600'
                    }
                  >
                    KES {Math.abs(statementDetails.summary.closingBalance).toLocaleString()}
                  </p>
                </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Property</p>
                      <p className="font-semibold">
                        {statementDetails.property?.property_name || 'My Unit'}
                        {statementDetails.property?.unit_number ? ` • ${statementDetails.property.unit_number}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="rounded-lg border p-4 bg-slate-50">
                      <p className="text-xs text-muted-foreground">Opening Balance</p>
                      <p className="text-lg font-bold">
                        KES {statementDetails.summary.openingBalance.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 bg-slate-50">
                      <p className="text-xs text-muted-foreground">Charges</p>
                      <p className="text-lg font-bold text-slate-900">
                        KES {statementDetails.summary.totalCharges.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 bg-slate-50">
                      <p className="text-xs text-muted-foreground">Payments</p>
                      <p className="text-lg font-bold text-blue-600">
                        KES {statementDetails.summary.totalPayments.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 bg-slate-50">
                    <p className="text-xs text-muted-foreground">Closing Balance</p>
                    <p
                      className={`text-lg font-bold ${
                        statementDetails.summary.closingBalance < 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      KES {Math.abs(statementDetails.summary.closingBalance).toLocaleString()}
                    </p>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden bg-white">
                    <div className="max-h-[55vh] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left p-3 font-semibold">Date</th>
                            <th className="text-left p-3 font-semibold">Description</th>
                        <th className="text-left p-3 font-semibold">Reference</th>
                        <th className="text-right p-3 font-semibold">Debit</th>
                        <th className="text-right p-3 font-semibold">Credit</th>
                        <th className="text-right p-3 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementDetails.transactions.map((txn) => {
                        const isCredit = txn.amount < 0
                        const formattedAmount = `KES ${Math.abs(txn.amount).toLocaleString()}`
                        const balanceRaw = txn.balance_after ?? 0
                        const balanceFormatted = `KES ${Math.abs(balanceRaw).toLocaleString()}`
                        const balanceClass =
                          balanceRaw < 0 ? 'text-green-600' : 'text-red-600'
                        return (
                          <tr key={txn.id} className="border-b last:border-0">
                            <td className="p-3">
                              {txn.posted_at ? new Date(txn.posted_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="p-3 capitalize">
                              <p>{txn.description}</p>
                              {txn.coverage_label ? (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Coverage: {txn.coverage_label}
                                </p>
                              ) : null}
                            </td>
                            <td className="p-3">{txn.reference || '—'}</td>
                            <td className="p-3 text-right text-slate-900">
                              {isCredit ? '—' : formattedAmount}
                            </td>
                            <td className="p-3 text-right text-green-600">
                              {isCredit ? formattedAmount : '—'}
                            </td>
                            <td className={`p-3 text-right font-semibold ${balanceClass}`}>
                              {balanceFormatted}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
                </>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      onClick={() => downloadReceiptPdf(receiptDetails)}
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
                        <p>Need help? Reach us at support@res.com</p>
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
