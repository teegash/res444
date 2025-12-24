'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Loader2, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
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
  type: 'charge' | 'payment'
  description: string
  reference: string | null
  amount: number
  posted_at: string | null
  status?: string
  method?: string | null
  balance_after?: number
}

type StatementPayload = {
  invoice: {
    id: string
    invoice_type: string
    amount: number
    due_date: string | null
    status: string | null
    description: string | null
  }
  tenant: {
    name: string
    phone_number: string | null
    profile_picture_url: string | null
  }
  lease: {
    id: string
    property_name: string | null
    property_location: string | null
    unit_number: string | null
    monthly_rent: number | null
    rent_paid_until: string | null
    start_date: string | null
    end_date: string | null
  } | null
  transactions: StatementTransaction[]
  summary: {
    openingBalance: number
    closingBalance: number
    totalPayments: number
  }
}

export default function TenantStatementPage({ params }: { params: { id: string } }) {
  const [statement, setStatement] = useState<StatementPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const loadStatement = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/tenant/statements/${params.id}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load statement.')
        }
        setStatement(payload.data || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statement.')
        setStatement(null)
      } finally {
        setLoading(false)
      }
    }

    loadStatement()
  }, [params.id])

  const formatCurrency = (value: number) =>
    `KES ${value.toLocaleString('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleDateString()
  }

  const tenantName = statement?.tenant?.name || 'Tenant'
  const propertyLabel = statement?.lease
    ? `${statement.lease.property_name || 'Property'}${
        statement.lease.unit_number ? ` - ${statement.lease.unit_number}` : ''
      }`
    : 'Property not assigned'

  const exportColumns: ExportColumn<StatementTransaction>[] = [
    {
      header: 'Date',
      accessor: (txn) => formatDate(txn.posted_at),
    },
    {
      header: 'Type',
      accessor: (txn) => (txn.type === 'charge' ? 'Charge' : 'Payment'),
    },
    {
      header: 'Description',
      accessor: (txn) => txn.description,
    },
    {
      header: 'Reference',
      accessor: (txn) => txn.reference || '',
    },
    {
      header: 'Debit (KES)',
      accessor: (txn) => (txn.amount > 0 ? formatCurrency(txn.amount) : ''),
    },
    {
      header: 'Credit (KES)',
      accessor: (txn) => (txn.amount < 0 ? formatCurrency(Math.abs(txn.amount)) : ''),
    },
    {
      header: 'Balance',
      accessor: (txn) => formatCurrency(txn.balance_after || 0),
    },
  ]

  const handleExport = async (format: 'pdf' | 'csv' | 'excel') => {
    if (!statement) return
    try {
      setExporting(true)
      const fileBase = `statement-${tenantName.replace(/\s+/g, '-').toLowerCase()}-${params.id}`
      const subtitle = `${tenantName} • ${propertyLabel}`
      const letterhead = {
        tenantName,
        tenantPhone: statement.tenant.phone_number || undefined,
        propertyName: statement.lease?.property_name || undefined,
        unitNumber: statement.lease?.unit_number || undefined,
        documentTitle: 'Account Statement',
        generatedAtISO: new Date().toISOString(),
      }

      switch (format) {
        case 'pdf':
          await exportRowsAsPDF(fileBase, exportColumns, statement.transactions, {
            title: 'Account Statement',
            subtitle,
            footerNote: `Generated on ${new Date().toLocaleString()}`,
            letterhead,
          })
          break
        case 'csv':
          await exportRowsAsCSV(fileBase, exportColumns, statement.transactions, undefined, { letterhead })
          break
        case 'excel':
          await exportRowsAsExcel(fileBase, exportColumns, statement.transactions, undefined, { letterhead })
          break
      }
    } finally {
      setExporting(false)
    }
  }

  const handleShare = async () => {
    if (!statement) return
    const shareData = {
      title: 'Account Statement',
      text: `Statement for ${tenantName} (${propertyLabel})`,
      url: window.location.href,
    }

    if (navigator.share) {
      await navigator.share(shareData)
    } else {
      await navigator.clipboard.writeText(shareData.url)
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
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
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
                <Button size="sm" className="gap-2" disabled={exporting}>
                  <Download className="h-4 w-4" />
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
                <p className="text-sm text-muted-foreground">#{statement.invoice.id.slice(0, 8)}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant</p>
                <p className="font-semibold text-lg">{tenantName}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Statement Date</p>
                <p className="font-semibold">{formatDate(statement.invoice.due_date)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">{propertyLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Statement Period</p>
                <p className="font-semibold">{formatDate(statement.invoice.due_date)}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8 p-6 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Opening Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(statement.summary.openingBalance)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Closing Balance</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(statement.summary.closingBalance)}
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
                      <th className="text-left p-3 font-semibold text-sm">Description</th>
                      <th className="text-left p-3 font-semibold text-sm">Reference</th>
                      <th className="text-right p-3 font-semibold text-sm">Amount</th>
                      <th className="text-right p-3 font-semibold text-sm">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b">
                        <td className="p-3 text-sm">{formatDate(txn.posted_at)}</td>
                        <td className="p-3 text-sm capitalize">
                          {txn.description}
                          {txn.status && (
                            <span className="ml-2 text-xs text-muted-foreground uppercase">
                              {txn.status}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-sm">{txn.reference || '—'}</td>
                        <td
                          className={`p-3 text-sm text-right font-semibold ${
                            txn.amount < 0 ? 'text-green-600' : ''
                          }`}
                        >
                          {txn.amount < 0 ? '-' : ''}
                          {formatCurrency(Math.abs(txn.amount))}
                        </td>
                        <td className="p-3 text-sm text-right font-semibold">
                          {formatCurrency(txn.balance_after || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg text-sm text-center mb-6">
              <p className="font-medium mb-1">
                This statement is a summary of your account activity for the specified period.
              </p>
              <p className="text-muted-foreground">
                For any inquiries, please contact us at support@res.com or call +254 712 345 678
              </p>
            </div>

            <div className="pt-6 border-t text-center text-sm text-muted-foreground">
              <p>RES Ltd. | P.O. Box 12345-00100, Nairobi | www.res.com</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
