'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Printer, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF, ExportColumn } from '@/lib/export/download'
import { OrganizationBrand } from '@/components/statements/OrganizationBrand'
import { getFilteredStatementView, StatementPeriodFilter } from '@/lib/statements/periodFilter'

type StatementTransaction = {
  id: string
  kind: 'charge' | 'payment'
  payment_type: string
  payment_method: string | null
  status: string
  posted_at: string | null
  description: string
  reference: string | null
  amount: number
  balance_after?: number
  coverage_label?: string | null
}

type StatementPayload = {
  tenant: {
    id: string
    name: string
    phone_number: string | null
    email: string | null
    profile_picture_url: string | null
  }
  lease: {
    id: string
    status: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    rent_paid_until: string | null
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  period: { start: string | null; end: string | null }
  summary: {
    openingBalance: number
    closingBalance: number
    totalCharges: number
    totalPayments: number
  }
  transactions: StatementTransaction[]
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'KES 0'
  return `KES ${value.toLocaleString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString()
}

export default function TenantAccountStatementPage() {
  const searchParams = useSearchParams()
  const leaseId = searchParams.get('leaseId')?.trim() || ''
  const [statement, setStatement] = useState<StatementPayload | null>(null)
  const [organization, setOrganization] = useState<{ name: string; logo_url: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<StatementPeriodFilter>('all')

  useEffect(() => {
    const loadOrg = async () => {
      try {
        const response = await fetch('/api/organizations/current', {
          cache: 'no-store',
          credentials: 'include',
        })
        const payload = await response.json().catch(() => ({}))
        if (response.ok && payload?.success && payload?.data?.name) {
          setOrganization({
            name: payload.data.name,
            logo_url: payload.data.logo_url || null,
          })
        }
      } catch {
        // non-blocking
      }
    }
    loadOrg()
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const qs = new URLSearchParams()
        if (leaseId) qs.set('leaseId', leaseId)
        const res = await fetch(`/api/tenant/statement${qs.toString() ? `?${qs.toString()}` : ''}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to load statement.')
        }
        setStatement(payload.data || null)
        setError(null)
      } catch (e) {
        setStatement(null)
        setError(e instanceof Error ? e.message : 'Failed to load statement.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leaseId])

  const filteredView = useMemo(
    () => getFilteredStatementView(statement?.transactions || [], periodFilter),
    [statement?.transactions, periodFilter]
  )

  const tenantName = statement?.tenant?.name || 'Tenant'
  const transactions = filteredView.transactions
  const closingBalance = filteredView.summary.closingBalance
  const openingBalance = filteredView.summary.openingBalance
  const statementDate = statement?.period?.end ? formatDate(statement.period.end) : formatDate(new Date().toISOString())
  const propertyLabel = statement?.lease
    ? `${statement.lease.property_name || 'Property'}${statement.lease.unit_number ? ` - ${statement.lease.unit_number}` : ''}`
    : 'Property not assigned'

  const periodLabel = useMemo(() => {
    const activePeriod = periodFilter === 'all' ? statement?.period : filteredView.period
    const start = activePeriod?.start || null
    const end = activePeriod?.end || null
    if (start && end) {
      const startDate = new Date(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      const endDate = new Date(end).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      return `${startDate} - ${endDate}`
    }
    if (end) {
      return new Date(end).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    return periodFilter === 'all' ? 'Latest activity' : 'No activity in selected period'
  }, [statement?.period?.start, statement?.period?.end, filteredView.period, periodFilter])

  const exportColumns: ExportColumn<StatementTransaction>[] = [
    { header: 'Date', accessor: (txn) => formatDate(txn.posted_at) },
    { header: 'Type', accessor: (txn) => txn.kind },
    { header: 'Description', accessor: (txn) => txn.description },
    { header: 'Reference', accessor: (txn) => txn.reference || '—' },
    { header: 'Debit', accessor: (txn) => (txn.amount > 0 ? formatCurrency(txn.amount) : ''), align: 'right' },
    { header: 'Credit', accessor: (txn) => (txn.amount < 0 ? formatCurrency(Math.abs(txn.amount)) : ''), align: 'right' },
    { header: 'Balance', accessor: (txn) => formatCurrency(txn.balance_after ?? 0), align: 'right' },
  ]

  const handleExport = async (format: 'pdf' | 'csv' | 'excel') => {
    if (!statement) return
    setExporting(true)
    const fileBase = `account-statement-${tenantName.replace(/\s+/g, '-').toLowerCase()}`
    const subtitle = `${tenantName} • ${propertyLabel} • ${periodLabel}`
    const letterhead = {
      organizationName: organization?.name || 'RES',
      organizationLogoUrl: organization?.logo_url || null,
      tenantName,
      tenantPhone: statement.tenant.phone_number || undefined,
      propertyName: statement.lease?.property_name || undefined,
      unitNumber: statement.lease?.unit_number || undefined,
      documentTitle: 'Account Statement',
      generatedAtISO: new Date().toISOString(),
    }
    try {
      if (format === 'pdf') {
        await exportRowsAsPDF(fileBase, exportColumns, transactions, {
          title: 'Account Statement',
          subtitle,
          footerNote: `Generated on ${new Date().toLocaleString()}`,
          letterhead,
        })
      } else if (format === 'excel') {
        await exportRowsAsExcel(fileBase, exportColumns, transactions, undefined, { letterhead })
      } else {
        await exportRowsAsCSV(fileBase, exportColumns, transactions, undefined, { letterhead })
      }
    } finally {
      setExporting(false)
    }
  }

  const handleShare = async () => {
    const sharePayload = {
      title: 'Account Statement',
      text: `Statement for ${tenantName}`,
      url: window.location.href,
    }
    if (navigator.share) {
      await navigator.share(sharePayload)
    } else {
      await navigator.clipboard.writeText(sharePayload.url)
      alert('Statement link copied to clipboard.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading statement…
        </div>
      </div>
    )
  }

  if (error || !statement) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 space-y-3 text-center">
            <p className="text-sm text-red-600">{error || 'Statement data unavailable.'}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-4 lg:px-6 py-4 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/tenant/payments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Account Statement</h1>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as StatementPeriodFilter)}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="month">Past month</SelectItem>
                <SelectItem value="3months">Past 3 months</SelectItem>
                <SelectItem value="6months">Past 6 months</SelectItem>
                <SelectItem value="year">Past 1 year</SelectItem>
                <SelectItem value="all">All history</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-2" disabled={exporting}>
                  <Download className="h-4 w-4" />
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 sm:p-6 lg:p-10">
            <div className="flex items-start justify-between mb-8 pb-6 border-b">
              <OrganizationBrand name={organization?.name || 'RES'} logoUrl={organization?.logo_url || null} />
              <div className="text-right">
                <h3 className="text-xl font-bold">ACCOUNT STATEMENT</h3>
                <p className="text-sm text-muted-foreground">
                  #{(statement?.tenant?.id || '').slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant</p>
                <p className="font-semibold text-lg">{tenantName}</p>
                {statement.tenant.phone_number ? (
                  <p className="text-sm text-muted-foreground">{statement.tenant.phone_number}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Statement Date</p>
                <p className="font-semibold">{statementDate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">{propertyLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Statement Period</p>
                <p className="font-semibold">{periodLabel}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8 p-6 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Opening Balance</p>
                <p className="text-2xl font-bold">KES {Math.abs(openingBalance).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Closing Balance</p>
                <p
                  className={`text-2xl font-bold ${
                    closingBalance < 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  KES {Math.abs(closingBalance).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-semibold text-sm w-28">Date</th>
                      <th className="text-left p-3 font-semibold text-sm w-28">Type</th>
                      <th className="text-left p-3 font-semibold text-sm">Description</th>
                      <th className="text-left p-3 font-semibold text-sm w-56">Reference</th>
                      <th className="text-right p-3 font-semibold text-sm w-28">Debit</th>
                      <th className="text-right p-3 font-semibold text-sm w-28">Credit</th>
                      <th className="text-right p-3 font-semibold text-sm w-32">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                          No transactions recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((transaction) => {
                        const isCredit = transaction.amount < 0
                        const displayAmount = formatCurrency(Math.abs(transaction.amount))
                        const balanceRaw = transaction.balance_after ?? 0
                        const balanceText = `KES ${Math.abs(balanceRaw).toLocaleString()}`
                        const balanceClass = balanceRaw < 0 ? 'text-green-600' : 'text-red-600'
                        return (
                          <tr key={transaction.id} className="border-b last:border-0">
                            <td className="p-3 text-sm">{formatDate(transaction.posted_at)}</td>
                            <td className="p-3 text-sm capitalize">
                              {transaction.payment_type || transaction.kind}
                            </td>
                            <td className="p-3 text-sm">
                              <p>{transaction.description}</p>
                              {transaction.coverage_label ? (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Coverage: {transaction.coverage_label}
                                </p>
                              ) : null}
                            </td>
                            <td className="p-3 text-sm font-mono text-slate-700 break-all leading-5">
                              {transaction.reference || '—'}
                            </td>
                            <td className="p-3 text-sm text-right text-slate-900">
                              {isCredit ? '—' : displayAmount}
                            </td>
                            <td className="p-3 text-sm text-right text-green-600">
                              {isCredit ? displayAmount : '—'}
                            </td>
                            <td className={`p-3 text-sm text-right font-semibold ${balanceClass}`}>
                              {balanceText}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
