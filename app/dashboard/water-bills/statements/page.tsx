'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Filter, Loader2, RefreshCw, Droplet } from 'lucide-react'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'

type WaterBillRecord = {
  id: string
  property_id: string | null
  property_name: string | null
  property_location: string | null
  unit_id: string | null
  unit_number: string | null
  tenant_id: string | null
  tenant_name: string | null
  tenant_phone: string | null
  tenant_email: string | null
  billing_month: string | null
  amount: number
  status: 'paid' | 'unpaid'
  invoice_due_date: string | null
  created_at: string | null
  notes: string | null
  units_consumed: number | null
}

type WaterBillSummary = {
  total: number
  paid_count: number
  unpaid_count: number
  paid_amount: number
  unpaid_amount: number
}

type PropertyOption = {
  id: string
  name: string
  location: string
}

export default function WaterBillStatementsPage() {
  const [records, setRecords] = useState<WaterBillRecord[]>([])
  const [summary, setSummary] = useState<WaterBillSummary | null>(null)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [propertyFilter, setPropertyFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [lastRefresh, setLastRefresh] = useState<string>('')

  const fetchStatements = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/water-bills/statement', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load water bills.')
      }
      setRecords(payload.data || [])
      setSummary(payload.summary || null)
      setProperties(payload.properties || [])
      setLastRefresh(new Date().toLocaleString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load water bill statements.')
      setRecords([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatements()
  }, [])

  const filteredRecords = useMemo(() => {
    const base = records.filter((record) => {
      if (propertyFilter !== 'all' && record.property_id !== propertyFilter) {
        return false
      }
      return true
    })

    const search = searchTerm.trim().toLowerCase()
    const searchFiltered = base.filter((record) => {
      if (!search) return true
      const propertyInitial = record.property_name?.[0]?.toLowerCase() || ''
      const unitValue = record.unit_number?.toLowerCase() || ''
      const tenantInitial = record.tenant_name?.[0]?.toLowerCase() || ''
      return (
        propertyInitial === search ||
        tenantInitial === search ||
        unitValue.includes(search) ||
        (record.tenant_name || '').toLowerCase().startsWith(search)
      )
    })

    return searchFiltered.filter((record) =>
      statusFilter === 'all' ? true : record.status === statusFilter
    )
  }, [records, propertyFilter, searchTerm, statusFilter])

  const paidCount = filteredRecords.filter((record) => record.status === 'paid').length
  const totalFiltered = filteredRecords.length
  const progressValue = totalFiltered > 0 ? Math.round((paidCount / totalFiltered) * 100) : 0

  const renderStatusBadge = (status: 'paid' | 'unpaid') => {
    const variant =
      status === 'paid'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-orange-50 text-orange-700 border-orange-200'
    return (
      <Badge className={`${variant} border rounded-full px-3 py-1 capitalize`}>
        {status}
      </Badge>
    )
  }

  const formatCurrency = (value: number) =>
    `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const exportColumns = [
    { header: 'Tenant', accessor: (record: WaterBillRecord) => record.tenant_name || '—' },
    { header: 'Property', accessor: (record: WaterBillRecord) => record.property_name || '—' },
    { header: 'Unit', accessor: (record: WaterBillRecord) => record.unit_number || '—' },
    {
      header: 'Billing Month',
      accessor: (record: WaterBillRecord) =>
        record.billing_month
          ? new Date(record.billing_month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : '—',
    },
    {
      header: 'Debit (KES)',
      accessor: (record: WaterBillRecord) => (record.status === 'unpaid' ? formatCurrency(record.amount) : ''),
    },
    {
      header: 'Credit (KES)',
      accessor: (record: WaterBillRecord) => (record.status === 'paid' ? formatCurrency(record.amount) : ''),
    },
    {
      header: 'Status',
      accessor: (record: WaterBillRecord) => record.status.toUpperCase(),
    },
    {
      header: 'Invoice Due',
      accessor: (record: WaterBillRecord) =>
        record.invoice_due_date ? new Date(record.invoice_due_date).toLocaleDateString() : '—',
    },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 md:p-10 space-y-6 overflow-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="icon" aria-label="Back to water bills">
                  <Link href="/dashboard/water-bills">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h1 className="text-2xl font-bold">Water Bill Statements</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Track paid vs unpaid water invoices across your properties
              </p>
              {lastRefresh && (
                <p className="text-xs text-muted-foreground mt-1">Last updated {lastRefresh}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={fetchStatements} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const fileBase = `water-bill-statements-${new Date().toISOString().slice(0, 10)}`
                  const generatedAtISO = new Date().toISOString()
                  const letterhead = { documentTitle: 'Water Bill Statements', generatedAtISO }
                  if (filteredRecords.length === 0) return
                  exportRowsAsPDF(fileBase, exportColumns, filteredRecords, {
                    title: 'Water Bill Statements',
                    subtitle: `Filtered (${propertyFilter}, ${statusFilter})`,
                    letterhead,
                  })
                }}
                disabled={loading || filteredRecords.length === 0}
              >
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const fileBase = `water-bill-statements-${new Date().toISOString().slice(0, 10)}`
                  const generatedAtISO = new Date().toISOString()
                  const letterhead = { documentTitle: 'Water Bill Statements', generatedAtISO }
                  if (filteredRecords.length === 0) return
                  exportRowsAsExcel(fileBase, exportColumns, filteredRecords, undefined, { letterhead })
                }}
                disabled={loading || filteredRecords.length === 0}
              >
                Export Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const fileBase = `water-bill-statements-${new Date().toISOString().slice(0, 10)}`
                  const generatedAtISO = new Date().toISOString()
                  const letterhead = { documentTitle: 'Water Bill Statements', generatedAtISO }
                  if (filteredRecords.length === 0) return
                  exportRowsAsCSV(fileBase, exportColumns, filteredRecords, undefined, { letterhead })
                }}
                disabled={loading || filteredRecords.length === 0}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-6 space-y-2">
                <p className="text-sm text-muted-foreground">Total bills</p>
                <p className="text-3xl font-bold">{summary?.total ?? records.length}</p>
                <p className="text-xs text-muted-foreground">Across all properties</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-2">
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-3xl font-bold text-emerald-600">
                  {summary?.paid_count ?? records.filter((r) => r.status === 'paid').length}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary?.paid_amount ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-2">
                <p className="text-sm text-muted-foreground">Unpaid</p>
                <p className="text-3xl font-bold text-orange-600">
                  {summary?.unpaid_count ?? records.filter((r) => r.status === 'unpaid').length}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary?.unpaid_amount ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplet className="h-5 w-5 text-blue-600" />
                Payment performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <p>
                  {paidCount} of {totalFiltered || 0} filtered bills paid
                </p>
                <p className="font-semibold text-emerald-600">{progressValue}%</p>
              </div>
              <Progress value={progressValue} />
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {(['all', 'paid', 'unpaid'] as const).map((option) => (
                  <Button
                    key={option}
                    variant={statusFilter === option ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(option)}
                    className={
                      option === 'paid'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : option === 'unpaid'
                          ? 'bg-orange-600 hover:bg-orange-500 text-white'
                          : undefined
                    }
                  >
                    {option === 'all' ? 'All bills' : option === 'paid' ? 'Paid' : 'Unpaid'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All properties</SelectItem>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Search tenant initial or unit number</Label>
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Type first letter of tenant or unit number"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Water bill ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading water bills…
                </div>
              ) : filteredRecords.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">
                  No bills match your filters.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.6)] backdrop-blur">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-100/90 via-white/80 to-slate-100/90 backdrop-blur">
                      <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-700 border-b border-slate-200/70">
                        <th className="py-3 px-3">Tenant</th>
                        <th className="py-3 px-3">Property</th>
                        <th className="py-3 px-3">Unit</th>
                        <th className="py-3 px-3">Billing Month</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Invoice Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((record) => (
                        <tr
                          key={record.id}
                          className="border-b border-slate-100/80 odd:bg-white/70 even:bg-slate-50/60 hover:bg-slate-100/70 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <p className="font-medium">{record.tenant_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {record.tenant_phone || record.tenant_email || '—'}
                            </p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-medium">{record.property_name}</p>
                            <p className="text-xs text-muted-foreground">{record.property_location}</p>
                          </td>
                          <td className="py-3 px-3">{record.unit_number}</td>
                          <td className="py-3 px-3">
                            {record.billing_month
                              ? new Date(record.billing_month).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'long',
                                })
                              : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold">{formatCurrency(record.amount)}</td>
                          <td className="py-3 px-3">{renderStatusBadge(record.status)}</td>
                          <td className="py-3 px-3 text-sm text-muted-foreground">
                            {record.invoice_due_date
                              ? new Date(record.invoice_due_date).toLocaleDateString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
