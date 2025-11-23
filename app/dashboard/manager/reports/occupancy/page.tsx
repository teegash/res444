'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { Input } from '@/components/ui/input'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'

type OccupancyRow = {
  property: string
  occupied: number
  total: number
  moveIns: number
  moveOuts: number
}

const occupancyRows: OccupancyRow[] = [
  { property: 'Kilimani Heights', occupied: 22, total: 24, moveIns: 3, moveOuts: 1 },
  { property: 'Westlands Plaza', occupied: 16, total: 18, moveIns: 2, moveOuts: 1 },
  { property: 'Karen Villas', occupied: 7, total: 8, moveIns: 1, moveOuts: 0 },
  { property: 'Eastlands Court', occupied: 28, total: 32, moveIns: 4, moveOuts: 2 },
]

const periods = [
  { value: 'month', label: 'Last 30 days' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semi', label: '6 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]

export default function OccupancyReportPage() {
  const [period, setPeriod] = useState('quarter')
  const [property, setProperty] = useState('all')
  const [rows, setRows] = useState<OccupancyRow[]>(occupancyRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const scope = property === 'all' ? rows : rows.filter((row) => row.property === property)
    const term = search.trim().toLowerCase()
    if (!term) return scope
    return scope.filter((row) => row.property.toLowerCase().includes(term))
  }, [property, rows, search])

  const totals = useMemo(() => {
    const occupied = filtered.reduce((sum, row) => sum + row.occupied, 0)
    const total = filtered.reduce((sum, row) => sum + row.total, 0)
    const moveIns = filtered.reduce((sum, row) => sum + row.moveIns, 0)
    const moveOuts = filtered.reduce((sum, row) => sum + row.moveOuts, 0)
    return {
      occupancyRate: total === 0 ? 0 : (occupied / total) * 100,
      moveIns,
      moveOuts,
    }
  }, [filtered])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `occupancy-${period}-${property}-${new Date().toISOString().slice(0, 10)}`
    const columns = [
      { header: 'Property', accessor: (row: OccupancyRow) => row.property },
      { header: 'Occupied', accessor: (row: OccupancyRow) => `${row.occupied}/${row.total}` },
      { header: 'Move-ins', accessor: (row: OccupancyRow) => row.moveIns },
      { header: 'Move-outs', accessor: (row: OccupancyRow) => row.moveOuts },
    ]
    const rows = filtered.map((row) => ({ ...row }))
    const totalOccupied = rows.reduce((sum, r) => sum + r.occupied, 0)
    const totalUnits = rows.reduce((sum, r) => sum + r.total, 0)
    const summaryRows = [
      ['Totals', `${totalOccupied}/${totalUnits}`, '', ''],
    ]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, rows, {
        title: 'Occupancy Report',
        subtitle: `Period: ${period}, Property: ${property}`,
        summaryRows,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, rows, summaryRows)
    } else {
      exportRowsAsCSV(filename, columns, rows, summaryRows)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/manager/reports/occupancy?period=${period}&property=${encodeURIComponent(property)}`
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load occupancy data.')
      }
      setRows(payload.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load occupancy data.')
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
                <h1 className="text-3xl font-bold">Occupancy Report</h1>
                <p className="text-sm text-muted-foreground">Rates, move-ins, and move-outs by property.</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 w-48"
                  placeholder="Search property"
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
              <CardDescription>Summary for the selected scope.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white border">
                <p className="text-xs text-muted-foreground">Occupancy rate</p>
                <p className="text-3xl font-bold text-emerald-700">{totals.occupancyRate.toFixed(1)}%</p>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white border">
                <p className="text-xs text-muted-foreground">Move-ins</p>
                <p className="text-3xl font-bold text-blue-700">{totals.moveIns}</p>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-white border">
                <p className="text-xs text-muted-foreground">Move-outs</p>
                <p className="text-3xl font-bold text-red-600">{totals.moveOuts}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Property breakdown</CardTitle>
              <CardDescription>Current occupancy and churn signals.</CardDescription>
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
                <div className="text-sm text-muted-foreground">No occupancy data.</div>
              ) : null}
              {filtered.map((row) => {
                const rate = row.total === 0 ? 0 : (row.occupied / row.total) * 100
                return (
                  <div key={row.property} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{row.property}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline">{row.occupied}/{row.total} occupied</Badge>
                        <Badge variant="secondary">{rate.toFixed(1)}%</Badge>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.min(100, rate)}%`, background: '#10b981' }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Move-ins: {row.moveIns} • Move-outs: {row.moveOuts}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
