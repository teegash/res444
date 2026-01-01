'use client'

import * as React from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Download, WalletCards } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
import { downloadReceiptPdf } from '@/lib/payments/receiptPdf'
import { downloadExpenseReceiptPdf } from '@/lib/expenses/expenseReceiptPdf'
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
    reference: string | null
    paymentMethod: string | null
    receiptUrl: string | null
    tenantUserId: string | null
    invoiceType: string | null
    monthsPaid: number | null
    isPrepayment: boolean
    createdAt: string | null
    notes: string | null
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

export default function FinancialReportPage() {
  const { toast } = useToast()
  const gridApiRef = React.useRef<GridApi | null>(null)
  const ledgerApiRef = React.useRef<GridApi | null>(null)
  const router = useRouter()
  const [receiptRow, setReceiptRow] = React.useState<FinancialPayload['ledger'][number] | null>(null)

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
      {
        label: 'Total income',
        value: kes(k.totalIncome),
        subtext: scopeLabel,
        valueClassName: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'Total expenses',
        value: kes(k.totalExpenses),
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
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

  const expenseBreakdown = React.useMemo(() => {
    const categories = payload?.expenseBreakdown?.categories || {}
    const palette = ['#7f1d1d', '#c2410c', '#fb923c', '#f59e0b', '#fde047', '#fef3c7', '#ffffff']
    const entries = Object.entries(categories)
      .map(([name, value]) => ({
        label: name,
        value: Number(value || 0),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)

    return entries.map((row, index) => ({
      key: `cat-${index}`,
      label: row.label,
      value: row.value,
      fill: palette[Math.min(index, palette.length - 1)],
    }))
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
      { headerName: 'Property', field: 'propertyName', minWidth: 200, flex: 2, filter: true },
      {
        headerName: 'Income',
        field: 'income',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Expenses',
        field: 'expenses',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'NOI',
        field: 'noi',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Expense ratio',
        minWidth: 150,
        flex: 1,
        valueGetter: (params) => {
          const income = Number(params.data?.income || 0)
          const expenses = Number(params.data?.expenses || 0)
          if (!income) return 0
          return (expenses / income) * 100
        },
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
      {
        headerName: 'Performance ratio',
        minWidth: 170,
        flex: 1,
        valueGetter: (params) => {
          const income = Number(params.data?.income || 0)
          const noi = Number(params.data?.noi || 0)
          if (!income) return 0
          return (noi / income) * 100
        },
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
    ],
    []
  )

  const handleOpenReceipt = React.useCallback((row: FinancialPayload['ledger'][number]) => {
    setReceiptRow(row)
  }, [])

  const handleCloseReceipt = React.useCallback(() => {
    setReceiptRow(null)
  }, [])

  const ledgerDefs = React.useMemo<ColDef<FinancialPayload['ledger'][number]>[]>(
    () => [
      { headerName: 'Date', field: 'date', minWidth: 130, flex: 1, filter: 'agDateColumnFilter' },
      { headerName: 'Type', field: 'type', minWidth: 120, flex: 1, filter: true },
      { headerName: 'Category', field: 'category', minWidth: 140, flex: 1, filter: true },
      { headerName: 'Property', field: 'propertyName', minWidth: 180, flex: 2, filter: true },
      {
        headerName: 'Amount',
        field: 'amount',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Receipt',
        field: 'receipt',
        minWidth: 120,
        flex: 1,
        cellRenderer: (params: { data?: FinancialPayload['ledger'][number] }) => {
          if (!params.data) return null
          return (
            <button
              type="button"
              onClick={() => handleOpenReceipt(params.data!)}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4"
            >
              View receipt
            </button>
          )
        },
      },
    ],
    [handleOpenReceipt]
  )

  const receiptDetails = React.useMemo(() => {
    if (!receiptRow) return null
    const dateLabel = receiptRow.date ? new Date(receiptRow.date).toLocaleDateString() : '—'
    const typeLabel = receiptRow.type === 'income' ? 'Income' : 'Expense'
    const sourceLabel = receiptRow.source === 'payment' ? 'Payment' : 'Expense'
    const reference =
      receiptRow.reference ||
      receiptRow.sourceId ||
      receiptRow.tenantUserId ||
      '—'
    const method = receiptRow.paymentMethod ? receiptRow.paymentMethod.replace(/_/g, ' ') : '—'

    return {
      title: receiptRow.type === 'income' ? 'Payment Receipt' : 'Expense Receipt',
      dateLabel,
      typeLabel,
      sourceLabel,
      reference,
      method,
    }
  }, [receiptRow])

  const handleDownloadReceipt = React.useCallback(() => {
    if (!receiptRow) return
    const run = async () => {
      try {
        if (receiptRow.type === 'income') {
          if (!receiptRow.sourceId) {
            throw new Error('Payment reference not found for this receipt.')
          }
          const res = await fetch(`/api/manager/receipts/${receiptRow.sourceId}`, { cache: 'no-store' })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || 'Failed to load receipt details.')
          }
          await downloadReceiptPdf(json.data)
          return
        }

        const payload = {
          expense: {
            id: receiptRow.sourceId || receiptRow.source || '',
            amount: Number(receiptRow.amount || 0),
            category: receiptRow.category || null,
            incurred_at: receiptRow.date || null,
            created_at: receiptRow.createdAt || null,
            notes: receiptRow.notes || null,
            reference: receiptRow.reference || receiptRow.sourceId || null,
          },
          property: {
            property_name: receiptRow.propertyName || null,
          },
        }

        await downloadExpenseReceiptPdf(payload)
      } catch (error) {
        toast({
          title: 'Receipt download failed',
          description: error instanceof Error ? error.message : 'Unable to download receipt.',
          variant: 'destructive',
        })
      }
    }

    void run()
  }, [receiptRow, toast])

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
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
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

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="border bg-background lg:col-span-2">
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

                <Card className="border bg-background lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Expense Breakdown</CardTitle>
                    <CardDescription>Expense totals by category in the selected period.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={expenseConfig} className="h-[300px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="key" />} />
                        <Pie
                          data={expenseBreakdown}
                          dataKey="value"
                          nameKey="key"
                          innerRadius={70}
                          outerRadius={110}
                          stroke="#f8fafc"
                          strokeWidth={2}
                        />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-blue-50/60">
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
                      rowClassRules={{
                        'ledger-row-income': (params) => params.data?.type === 'income',
                        'ledger-row-expense': (params) => params.data?.type === 'expense',
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

              <Dialog open={!!receiptRow} onOpenChange={(open) => (!open ? handleCloseReceipt() : null)}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{receiptDetails?.title || 'Transaction Receipt'}</DialogTitle>
                    <DialogDescription>Formal transaction summary for audit and reconciliation.</DialogDescription>
                  </DialogHeader>

                  {receiptRow ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Amount</p>
                          <p className="text-2xl font-semibold">{kes(Number(receiptRow.amount || 0))}</p>
                          <p className="text-xs text-muted-foreground">{receiptDetails?.dateLabel}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {receiptRow.isPrepayment ? (
                            <Badge className="bg-amber-100 text-amber-800">Prepayment</Badge>
                          ) : null}
                          <Badge
                            className={
                              receiptRow.type === 'income'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }
                          >
                            {receiptDetails?.typeLabel}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-4 rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Property</p>
                            <p className="font-medium">{receiptRow.propertyName || 'Property'}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Category</p>
                            <p className="font-medium capitalize">{receiptRow.category || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Source</p>
                            <p className="font-medium capitalize">{receiptDetails?.sourceLabel}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Reference</p>
                            <p className="font-mono text-xs break-all">{receiptDetails?.reference}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Method</p>
                            <p className="font-medium capitalize">{receiptDetails?.method}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs text-muted-foreground">Receipt ID</p>
                            <p className="font-mono text-xs break-all">{receiptRow.sourceId || '—'}</p>
                          </div>
                        </div>

                        {receiptRow.notes ? (
                          <div className="border-t border-slate-200/70 pt-3 text-xs text-muted-foreground">
                            <span className="font-semibold text-slate-700">Notes: </span>
                            {receiptRow.notes}
                          </div>
                        ) : null}

                        {receiptRow.receiptUrl ? (
                          <div className="text-xs">
                            <a
                              href={receiptRow.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-4"
                            >
                              View receipt attachment
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <DialogFooter className="gap-2 sm:gap-3">
                    <Button variant="outline" onClick={handleCloseReceipt}>
                      Close
                    </Button>
                    <Button onClick={handleDownloadReceipt}>
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
