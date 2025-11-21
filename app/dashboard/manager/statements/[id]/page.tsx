'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
import Sidebar from '@/components/dashboard/sidebar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

export default function TenantStatementPage({ params }: { params: { id: string } }) {
  const [statement, setStatement] = useState<StatementPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatement = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/manager/statements/${params.id}`, { cache: 'no-store' })
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
  }, [params.id])

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
                <h2 className="text-2xl font-bold text-green-600">RentalKenya</h2>
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
              <p className="text-2xl font-bold">{formatCurrency(openingBalance)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">Closing Balance</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(closingBalance)}</p>
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
                    <th className="text-right p-3 font-semibold text-sm">Amount</th>
                    <th className="text-right p-3 font-semibold text-sm">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        No transactions recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b last:border-0">
                        <td className="p-3 text-sm">{formatDate(transaction.posted_at)}</td>
                        <td className="p-3 text-sm capitalize">{transaction.payment_type || transaction.kind}</td>
                        <td className="p-3 text-sm">{transaction.description}</td>
                        <td className="p-3 text-sm">{transaction.reference || '—'}</td>
                        <td className="p-3 text-sm text-right font-medium">
                          {transaction.amount < 0 ? '-' : ''}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </td>
                        <td className="p-3 text-sm text-right">
                          {formatCurrency(transaction.balance_after ?? 0)}
                        </td>
                      </tr>
                    ))
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
      <main className="flex-1 p-6 md:p-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              <Link href="/dashboard/manager/tenants" className="text-blue-600 hover:underline">
                ← Back to Tenants
              </Link>
            </p>
            <h1 className="text-3xl font-bold">Tenant Statement</h1>
            <p className="text-sm text-muted-foreground">
              Detailed record of rent and utility transactions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        {renderContent()}
      </main>
    </div>
  )
}
