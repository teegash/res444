'use client'

import * as React from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonLoader } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, WalletCards } from 'lucide-react'

import { ReportFilters, type ReportFilterState } from '@/components/reports/ReportFilters'
import { KpiTiles } from '@/components/reports/KpiTiles'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

type FinancialPayload = {
  range: { start: string | null; end: string }
  groupBy: 'day' | 'week' | 'month'
  properties: Array<{ id: string; name: string }>
  kpis: {
    totalIncome: number
    totalExpenses: number
    netOperatingIncome: number
    expenseRatio: number
  }
  incomeSeries: Array<{ period: string; total: number; rent: number; water: number; other: number }>
  expenseSeries: Array<{ period: string; total: number }>
  incomeBreakdown: { rent: number; water: number; other: number; total: number }
  expenseBreakdown: { total: number; categories: Record<string, number> }
  byProperty: Array<{ propertyId: string; propertyName: string; income: number; expenses: number; noi: number }>
  ledger: Array<{
    date: string
    type: 'income' | 'expense'
    category: string
    propertyId: string | null
    propertyName: string
    amount: number
    source: string
    sourceId: string | null
  }>
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

const cashflowConfig = {
  income: { label: 'Income', color: '#16a34a' },
  expenses: { label: 'Expenses', color: '#ef4444' },
  noi: { label: 'NOI', color: '#2563eb' },
} satisfies ChartConfig

const incomeConfig = {
  rent: { label: 'Rent income', color: '#16a34a' },
  water: { label: 'Water income', color: '#0ea5e9' },
  other: { label: 'Other income', color: '#a855f7' },
} satisfies ChartConfig

export default function FinancialReportPage() {
  const { toast } = useToast()
  const gridApiRef = React.useRef<GridApi | null>(null)
  const ledgerApiRef = React.useRef<GridApi | null>(null)

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'month',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })

  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<FinancialPayload | null>(null)

  const handleFiltersChange = React.useCallback((next: ReportFilterState) => {
    if (next.period === 'custom' && (!next.startDate || !next.endDate)) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      next = {
        ...next,
        startDate: next.startDate || start.toISOString().slice(0, 10),
        endDate: next.endDate || end.toISOString().slice(0, 10),
      }
    }
    setFilters(next)
  }, [])

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams({
        period: filters.period,
        propertyId: filters.propertyId,
        groupBy: filters.groupBy,
      })
      if (filters.period === 'custom' && filters.startDate && filters.endDate) {
        qs.set('startDate', filters.startDate)
        qs.set('endDate', filters.endDate)
      }
      const res = await fetch(`/api/manager/reports/financial?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load financial report.')
      setPayload(json.data)
    } catch (e: any) {
      toast({
        title: 'Financial report failed',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [filters.period, filters.propertyId, filters.groupBy, filters.startDate, filters.endDate, toast])

  React.useEffect(() => {
    load()
  }, [load])

  const properties = payload?.properties || []
  const k = payload?.kpis

  const kpis = React.useMemo(() => {
    if (!k || !payload) return []
    const scopeLabel =
      filters.propertyId === 'all'
        ? 'Portfolio'
        : properties.find((p) => p.id === filters.propertyId)?.name || 'Property'

    return [
      { label: 'Total income', value: kes(k.totalIncome), subtext: scopeLabel },
      { label: 'Total expenses', value: kes(k.totalExpenses) },
      { label: 'Net operating income', value: kes(k.netOperatingIncome) },
      { label: 'Expense ratio', value: `${k.expenseRatio.toFixed(1)}%` },
    ]
  }, [k, payload, filters.propertyId, properties])

  const cashflowSeries = React.useMemo(() => {
    const map = new Map<string, { period: string; income: number; expenses: number; noi: number }>()
    for (const row of payload?.incomeSeries || []) {
      map.set(row.period, {
        period: row.period,
        income: row.total,
        expenses: 0,
        noi: 0,
      })
    }
    for (const row of payload?.expenseSeries || []) {
      const entry = map.get(row.period) || {
        period: row.period,
        income: 0,
        expenses: 0,
        noi: 0,
      }
      entry.expenses = row.total
      map.set(row.period, entry)
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, noi: row.income - row.expenses }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [payload?.incomeSeries, payload?.expenseSeries])

  const incomeBreakdown = React.useMemo(() => {
    if (!payload?.incomeBreakdown) return []
    return [
      { key: 'rent', value: payload.incomeBreakdown.rent, fill: incomeConfig.rent.color },
      { key: 'water', value: payload.incomeBreakdown.water, fill: incomeConfig.water.color },
      { key: 'other', value: payload.incomeBreakdown.other, fill: incomeConfig.other.color },
    ].filter((row) => row.value > 0)
  }, [payload?.incomeBreakdown])

  const expenseBreakdown = React.useMemo(() => {
    const categories = payload?.expenseBreakdown?.categories || {}
    const palette = ['#f97316', '#f59e0b', '#ef4444', '#e11d48', '#0ea5e9', '#6366f1', '#a855f7']
    return Object.entries(categories)
      .map(([name, value], index) => ({
        key: `cat-${index}`,
        label: name,
        value: Number(value || 0),
        fill: palette[index % palette.length],
      }))
      .filter((row) => row.value > 0)
  }, [payload?.expenseBreakdown])

  const expenseConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    for (const row of expenseBreakdown) {
      config[row.key] = { label: row.label, color: row.fill }
    }
    return config
  }, [expenseBreakdown])

  const propertyRows = payload?.byProperty || []

  const columnDefs = React.useMemo<ColDef<FinancialPayload['byProperty'][number]>[]>(
    () => [
      { headerName: 'Property', field: 'propertyName', minWidth: 180, filter: true },
      {
        headerName: 'Income',
        field: 'income',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Expenses',
        field: 'expenses',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'NOI',
        field: 'noi',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
    ],
    []
  )

  const ledgerDefs = React.useMemo<ColDef<FinancialPayload['ledger'][number]>[]>(
    () => [
      { headerName: 'Date', field: 'date', width: 130, filter: 'agDateColumnFilter' },
      { headerName: 'Type', field: 'type', width: 120, filter: true },
      { headerName: 'Category', field: 'category', minWidth: 140, filter: true },
      { headerName: 'Property', field: 'propertyName', minWidth: 180, filter: true },
      {
        headerName: 'Amount',
        field: 'amount',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
    ],
    []
  )

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return
    const filename = `financial-report-${filters.period}-${filters.propertyId}-${new Date()
      .toISOString()
      .slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Financial Report — P&L + Cashflow',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (row: any) => row.propertyName },
      { header: 'Income', accessor: (row: any) => kes(row.income) },
      { header: 'Expenses', accessor: (row: any) => kes(row.expenses) },
      { header: 'NOI', accessor: (row: any) => kes(row.noi) },
    ]

    const summaryRows = [
      [
        'TOTAL',
        kes(payload.kpis.totalIncome),
        kes(payload.kpis.totalExpenses),
        kes(payload.kpis.netOperatingIncome),
      ],
    ]

    const subtitle =
      `Income uses verified payments. Expenses use recorded expenses (including landlord-paid maintenance). ` +
      `NOI = Income - Expenses.`

    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, propertyRows, {
        title: 'Financial Report — P&L + Cashflow',
        subtitle,
        summaryRows,
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, propertyRows, summaryRows, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, propertyRows, summaryRows, { letterhead })
    }
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Financial Report</h1>
                <p className="text-sm text-muted-foreground">
                  Authoritative P&L and cashflow view for audit-grade reporting.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export P&amp;L
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loading ? (
            <SkeletonLoader />
          ) : (
            <>
              <ReportFilters value={filters} onChange={handleFiltersChange} properties={properties} />
              <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Income vs Expenses vs NOI</CardTitle>
                  <CardDescription>Cashflow by period using payment and expense dates.</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <ChartContainer config={cashflowConfig} className="h-[300px] w-full">
                    <BarChart data={cashflowSeries} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                      <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="noi" fill="var(--color-noi)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Income Breakdown</CardTitle>
                    <CardDescription>Rent vs water vs other income sources.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={incomeConfig} className="h-[280px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="key" />} />
                        <Pie data={incomeBreakdown} dataKey="value" nameKey="key" innerRadius={70} outerRadius={110} />
                        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Expense Breakdown</CardTitle>
                    <CardDescription>Expense totals by category in the selected period.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={expenseConfig} className="h-[280px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="key" />} />
                        <Pie data={expenseBreakdown} dataKey="value" nameKey="key" innerRadius={70} outerRadius={110} />
                        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Property P&amp;L</CardTitle>
                  <CardDescription>Income, expenses, and NOI per property.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<FinancialPayload['byProperty'][number]>
                      rowData={propertyRows}
                      columnDefs={columnDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: true,
                      }}
                      pagination
                      paginationPageSize={25}
                      animateRows
                      onGridReady={(params) => {
                        gridApiRef.current = params.api
                        params.api.sizeColumnsToFit()
                      }}
                      onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Transaction Ledger</CardTitle>
                  <CardDescription>Payments and expenses captured in the selected period.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<FinancialPayload['ledger'][number]>
                      rowData={payload?.ledger || []}
                      columnDefs={ledgerDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: true,
                      }}
                      pagination
                      paginationPageSize={25}
                      animateRows
                      onGridReady={(params) => {
                        ledgerApiRef.current = params.api
                        params.api.sizeColumnsToFit()
                      }}
                      onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
