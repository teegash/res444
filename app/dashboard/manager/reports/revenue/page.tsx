'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, TrendingUp, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { Input } from '@/components/ui/input'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'

type RevenueRow = {
  id?: string
  property: string
  propertyId?: string
  period: string
  month: string
  amount: number
}

const periods = [
  { value: 'month', label: 'Last 30 days' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semi', label: '6 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]

export default function RevenueReportPage() {
  const [period, setPeriod] = useState('quarter')
  const [property, setProperty] = useState('all')
  const [rows, setRows] = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const scope = property === 'all' ? rows : rows.filter((row) => row.property === property || row.propertyId === property)
    const term = search.trim().toLowerCase()
    if (!term) return scope
    return scope.filter((row) =>
      `${row.property} ${row.month}`.toLowerCase().includes(term)
    )
  }, [property, rows, search])

  const totals = useMemo(() => {
    const total = filtered.reduce((sum, row) => sum + row.amount, 0)
    const properties = Array.from(new Set(filtered.map((row) => row.property)))
    return { total, properties }
  }, [filtered])

  const byProperty = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach((row) => {
      map.set(row.property, (map.get(row.property) || 0) + row.amount)
    })
    return Array.from(map.entries())
  }, [filtered])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `revenue-${period}-${property}-${new Date().toISOString().slice(0, 10)}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = { documentTitle: 'Revenue Report', generatedAtISO }
    const columns = [
      { header: 'Property', accessor: (row: RevenueRow) => row.property },
      { header: 'Period', accessor: (row: RevenueRow) => row.period },
      { header: 'Month', accessor: (row: RevenueRow) => row.month },
      { header: 'Debit (KES)', accessor: () => '' },
      { header: 'Credit (KES)', accessor: (row: RevenueRow) => `KES ${row.amount.toLocaleString()}` },
    ]
    const total = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const summaryRows = [['Total', '', '', '', `KES ${total.toLocaleString()}`]]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, filtered, {
        title: 'Revenue Report',
        subtitle: `Period: ${period}, Property: ${property}`,
        summaryRows,
        letterhead,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, filtered, summaryRows, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, filtered, summaryRows, { letterhead })
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/manager/reports/revenue?period=${period}&property=${encodeURIComponent(property)}`
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load revenue data.')
      }
      const mapped: RevenueRow[] =
        (payload.data || []).map((row: any) => ({
          id: row.id,
          property: row.property,
          propertyId: row.propertyId,
          amount: row.amount,
          period,
          month: row.payment_date
            ? new Date(row.payment_date).toLocaleString('default', { month: 'short' })
            : '—',
        })) || []
      setRows(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load revenue data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [period, property])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/manager/reports">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">Revenue Report</h1>
                <p className="text-sm text-muted-foreground">Trends by property with export options.</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 w-48"
                  placeholder="Search property or month"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={property} onValueChange={setProperty}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {Array.from(new Set(rows.map((row) => row.property))).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => handleExport('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => handleExport('excel')}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport('csv')}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Snapshot</CardTitle>
              <CardDescription>Aggregate totals for the selected period and property scope.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              {loading ? (
                <>
                  <SkeletonLoader height={20} width="60%" />
                  <SkeletonLoader height={20} width="40%" />
                  <SkeletonLoader height={20} width="50%" />
                </>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white border">
                    <p className="text-xs text-muted-foreground">Total revenue</p>
                    <p className="text-3xl font-bold text-emerald-700">KES {totals.total.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Healthy upward trend
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white border">
                    <p className="text-xs text-muted-foreground">Properties</p>
                    <p className="text-3xl font-bold text-blue-700">{totals.properties.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Filtered scope</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border">
                    <p className="text-xs text-muted-foreground">Period</p>
                    <p className="text-lg font-semibold capitalize">{period}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Property breakdown</CardTitle>
              <CardDescription>Revenue summed per property.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <>
                  <SkeletonLoader height={16} width="40%" />
                  <SkeletonTable rows={4} columns={3} />
                </>
              ) : error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No revenue data.</div>
              ) : null}
              {byProperty.map(([name, amount]) => (
                <div key={name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <Badge variant="outline">KES {amount.toLocaleString()}</Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, amount / 600000 * 100)}%`,
                        background: 'linear-gradient(90deg,#10b981,#2563eb)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
