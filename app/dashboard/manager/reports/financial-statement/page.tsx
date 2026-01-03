'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'

type StatementRow = {
  id?: string
  property: string
  propertyId?: string
  month: string
  income: number
  expenses: number
}

const periods = [
  { value: 'month', label: 'Last 30 days' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semi', label: '6 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]

export default function FinancialStatementPage() {
  const [period, setPeriod] = useState('quarter')
  const [property, setProperty] = useState('all')
  const [rowsState, setRowsState] = useState<StatementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (property === 'all') return rowsState
    return rowsState.filter((row) => row.property === property)
  }, [property, rowsState])

  const summary = useMemo(() => {
    const income = filtered.reduce((sum, row) => sum + row.income, 0)
    const expenses = filtered.reduce((sum, row) => sum + row.expenses, 0)
    const net = income - expenses
    return { income, expenses, net }
  }, [filtered])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `financial-statement-${period}-${property}-${new Date().toISOString().slice(0, 10)}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = { documentTitle: 'Financial Statement', generatedAtISO }
    const columns = [
      { header: 'Property', accessor: (row: StatementRow) => row.property },
      { header: 'Month', accessor: (row: StatementRow) => row.month },
      { header: 'Income', accessor: (row: StatementRow) => `KES ${row.income.toLocaleString()}` },
      { header: 'Expenses', accessor: (row: StatementRow) => `KES ${row.expenses.toLocaleString()}` },
      { header: 'Net', accessor: (row: StatementRow) => `KES ${(row.income - row.expenses).toLocaleString()}` },
    ]
    if (format === 'pdf') {
      const scopeLabel = property === 'all' ? 'All properties' : property
      exportRowsAsPDF(filename, columns, filtered, {
        title: 'Financial Statement',
        subtitle: `Period: ${period}. Scope: ${scopeLabel}.`,
        letterhead,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, filtered, undefined, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, filtered, undefined, { letterhead })
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/manager/reports/financial?period=${period}&property=${encodeURIComponent(property)}`
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load financial data.')
      }
      setRowsState(payload.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load financial data.')
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
                <h1 className="text-3xl font-bold">Financial Statement</h1>
                <p className="text-sm text-muted-foreground">Income vs expenses with exportable statements.</p>
              </div>
            </div>
            <div className="flex gap-2">
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
                  {Array.from(new Set(rowsState.map((row) => row.property))).map((p) => (
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
              <CardDescription>Net position for the selected scope.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              {loading ? (
                <>
                  <SkeletonLoader height={20} width="70%" />
                  <SkeletonLoader height={20} width="60%" />
                  <SkeletonLoader height={20} width="50%" />
                </>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white border">
                    <p className="text-xs text-muted-foreground">Total income</p>
                    <p className="text-3xl font-bold text-emerald-700">KES {summary.income.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-white border">
                    <p className="text-xs text-muted-foreground">Total expenses</p>
                    <p className="text-3xl font-bold text-red-600">KES {summary.expenses.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white border">
                    <p className="text-xs text-muted-foreground">Net</p>
                    <p className="text-3xl font-bold text-blue-700">KES {summary.net.toLocaleString()}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Statement detail</CardTitle>
              <CardDescription>Income, expenses, and net by month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <>
                  <SkeletonLoader height={16} width="50%" />
                  <SkeletonTable rows={4} columns={4} />
                </>
              ) : error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">No statement data.</div>
              ) : null}
              {filtered.map((row) => (
                <div key={`${row.property}-${row.month}`} className="p-3 rounded-lg border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{row.property}</p>
                    <p className="text-xs text-muted-foreground">Month: {row.month}</p>
                  </div>
                  <div className="flex gap-3 items-center">
                    <Badge variant="outline">Income: KES {row.income.toLocaleString()}</Badge>
                    <Badge variant="secondary">Expenses: KES {row.expenses.toLocaleString()}</Badge>
                    <Badge variant={row.income - row.expenses >= 0 ? 'default' : 'destructive'}>
                      Net: KES {(row.income - row.expenses).toLocaleString()}
                    </Badge>
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
