'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Loader2, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  exportRowsAsCSV,
  exportRowsAsExcel,
  exportRowsAsPDF,
  ExportColumn,
} from '@/lib/export/download'

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
    status: string
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    rent_paid_until: string | null
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  period: {
    start: string | null
    end: string | null
  }
  summary: {
    openingBalance: number
    closingBalance: number
    totalCharges: number
    totalPayments: number
  }
  transactions: StatementTransaction[]
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'KES 0'
  }
  return `KES ${value.toLocaleString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export default function TenantStatementPage({ params }: { params: { id?: string } }) {
  const [statement, setStatement] = useState<StatementPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryTenantId = searchParams.get('tenantId')?.trim() || ''
  const pathTenantId = useMemo(() => {
    if (!pathname) return ''
    const segments = pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1] || ''
    return lastSegment === 'statements' ? '' : lastSegment
  }, [pathname])
  const tenantId = (params?.id && params.id.trim()) || queryTenantId || pathTenantId || ''

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | null = null

    const fetchStatement = async () => {
      if (!tenantId) {
        setError('Missing tenant identifier. Redirecting to your tenant list...')
        setStatement(null)
        setLoading(false)
        redirectTimer = setTimeout(() => {
          router.replace('/dashboard/tenants')
        }, 1600)
        return
      }

      try {
        setLoading(true)
        const encodedTenantId = encodeURIComponent(tenantId)
        const response = await fetch(
          `/api/manager/statements/${encodedTenantId}?tenantId=${encodedTenantId}`,
          { cache: 'no-store' }
        )
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load tenant statement.')
        }
        setStatement(payload.data || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tenant statement.')
        setStatement(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStatement()

    return () => {
      if (redirectTimer) {
        clearTimeout(redirectTimer)
      }
    }
  }, [tenantId, router])

  const periodLabel = useMemo(() => {
    if (!statement?.period) return 'Latest activity'
    const { start, end } = statement.period
    if (start && end) {
      const startDate = new Date(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      const endDate = new Date(end).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      return `${startDate} - ${endDate}`
    }
    if (end) {
      return new Date(end).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    return 'Latest activity'
  }, [statement?.period])

  const statementDate = statement?.period?.end ? formatDate(statement.period.end) : formatDate(new Date().toISOString())
  const transactions = statement?.transactions || []
  const closingBalance = statement?.summary?.closingBalance ?? 0
  const openingBalance = statement?.summary?.openingBalance ?? 0
  const tenantName = statement?.tenant?.name || 'Tenant'
  const propertyLabel = statement?.lease
    ? `${statement.lease.property_name || 'Property'}${statement.lease.unit_number ? ` - ${statement.lease.unit_number}` : ''}`
    : 'Property not assigned'

  const exportColumns: ExportColumn<StatementTransaction>[] = [
    {
      header: 'Date',
      accessor: (txn) => formatDate(txn.posted_at),
    },
    {
      header: 'Type',
      accessor: (txn) => txn.kind,
    },
    {
      header: 'Description',
      accessor: (txn) => txn.description,
    },
    {
      header: 'Reference',
      accessor: (txn) => txn.reference || '—',
    },
    {
      header: 'Debit',
      accessor: (txn) => (txn.amount > 0 ? formatCurrency(txn.amount) : ''),
    },
    {
      header: 'Credit',
      accessor: (txn) => (txn.amount < 0 ? formatCurrency(Math.abs(txn.amount)) : ''),
    },
    {
      header: 'Balance',
      accessor: (txn) => formatCurrency(txn.balance_after ?? 0),
    },
  ]

  const handleExport = (format: 'pdf' | 'csv' | 'excel') => {
    if (!statement) return
    setExporting(true)
    const fileBase = tenantId ? `tenant-statement-${tenantId}` : 'tenant-statement'
    const subtitle = `${tenantName} • ${propertyLabel}`

    try {
      switch (format) {
        case 'pdf':
          exportRowsAsPDF(fileBase, exportColumns, statement.transactions, {
            title: 'Tenant Account Statement',
            subtitle,
            footerNote: `Generated on ${new Date().toLocaleString()}`,
          })
          break
        case 'csv':
          exportRowsAsCSV(fileBase, exportColumns, statement.transactions)
          break
        case 'excel':
          exportRowsAsExcel(fileBase, exportColumns, statement.transactions)
          break
      }
    } finally {
      setTimeout(() => setExporting(false), 300)
    }
  }

  const handleShare = async () => {
    if (!statement) return
    const sharePayload = {
      title: 'Tenant Statement',
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading statement…
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <Card className="mt-6">
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (!statement) {
      return (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Statement data is unavailable for this tenant.
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-8 md:p-12">
          <div className="flex items-start justify-between mb-8 pb-6 border-b">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <span className="text-2xl">🏢</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-600">RES</h2>
                <p className="text-sm text-muted-foreground">Property Management</p>
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-xl font-bold">ACCOUNT STATEMENT</h3>
              <p className="text-sm text-muted-foreground">#{statement.tenant.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tenant</p>
              <p className="font-semibold text-lg">{tenantName}</p>
              {statement.tenant.phone_number && (
                <p className="text-sm text-muted-foreground">{statement.tenant.phone_number}</p>
              )}
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
              <p className="text-2xl font-bold">
                KES {Math.abs(openingBalance).toLocaleString()}
              </p>
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
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-sm">Date</th>
                    <th className="text-left p-3 font-semibold text-sm">Type</th>
                    <th className="text-left p-3 font-semibold text-sm">Description</th>
                    <th className="text-left p-3 font-semibold text-sm">Reference</th>
                    <th className="text-right p-3 font-semibold text-sm">Debit</th>
                    <th className="text-right p-3 font-semibold text-sm">Credit</th>
                    <th className="text-right p-3 font-semibold text-sm">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        No transactions recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((transaction) => {
                      const isCredit = transaction.amount < 0
                      const displayAmount = formatCurrency(Math.abs(transaction.amount))
                      const balanceRaw = transaction.balance_after ?? 0
                      const balanceText = `KES ${Math.abs(balanceRaw).toLocaleString()}`
                      const balanceClass =
                        balanceRaw < 0 ? 'text-green-600' : 'text-red-600'
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
                          <td className="p-3 text-sm">{transaction.reference || '—'}</td>
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
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 md:p-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 px-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 w-auto transition-colors"
              asChild
            >
              <Link href="/dashboard/tenants" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Tenant Statement</h1>
            <p className="text-sm text-muted-foreground">
              Detailed record of rent and utility transactions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Download PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  Download Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  Download CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {renderContent()}
      </main>
      </div>
    </div>
  )
}
