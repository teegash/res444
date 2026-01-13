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
import Link from 'next/link'
import { ArrowLeft, Download, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'

import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'

ModuleRegistry.registerModules([AllCommunityModule])

type RevenuePayload = {
  range: { start: string | null; end: string }
  groupBy: 'day' | 'week' | 'month'
  properties: Array<{ id: string; name: string }>
  kpis: {
    billedTotal: number
    collectedTotal: number
    collectionRate: number
    billedRent: number
    billedWater: number
    avgMonthlyCollected: number
    bestProperty: { name: string; rate: number } | null
    worstProperty: { name: string; rate: number } | null
  }
  timeseries: Array<{
    period: string
    billedTotal: number
    billedRent: number
    billedWater: number
    collectedTotal: number
    collectionRate: number
  }>
  byProperty: Array<{
    propertyId: string
    propertyName: string
    billedTotal: number
    billedRent: number
    billedWater: number
    collectedTotal: number
    arrearsNow: number
    collectionRate: number
  }>
  topProperties: Array<{ propertyId: string; propertyName: string; collectedTotal: number }>
}

type PropertyRow = RevenuePayload['byProperty'][number]

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

function kesAbbrev(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}KES ${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}KES ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}KES ${(abs / 1_000).toFixed(1)}K`
  return `${sign}KES ${Math.round(abs).toLocaleString()}`
}

const perfConfig = {
  billedTotal: { label: 'Billed (Total)', color: 'var(--chart-2)' },
  collectedTotal: { label: 'Collected', color: 'var(--chart-1)' },
  billedRent: { label: 'Rent billed', color: 'var(--chart-3)' },
  billedWater: { label: 'Water billed', color: 'var(--chart-4)' },
  collectionRate: { label: 'Collection %', color: 'var(--chart-5)' },
} satisfies ChartConfig

export default function RevenueReportPage() {
  const { toast } = useToast()
  const router = useRouter()
  const gridApiRef = React.useRef<GridApi | null>(null)

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'quarter',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })

  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<RevenuePayload | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [selectedRow, setSelectedRow] = React.useState<PropertyRow | null>(null)

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

      const res = await fetch(`/api/manager/reports/revenue?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load revenue report.')
      setPayload(json.data)
    } catch (e: any) {
      toast({
        title: 'Revenue report failed',
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
      { label: 'Billed (period)', value: kes(k.billedTotal), subtext: scopeLabel },
      { label: 'Collected (period)', value: kes(k.collectedTotal) },
      { label: 'Collection rate', value: `${k.collectionRate.toFixed(1)}%` },
      { label: 'Rent billed', value: kes(k.billedRent) },
      { label: 'Water billed', value: kes(k.billedWater) },
      { label: 'Avg monthly collected', value: kes(k.avgMonthlyCollected), subtext: 'Collected / month' },
      {
        label: 'Best property',
        value: k.bestProperty ? `${k.bestProperty.rate.toFixed(1)}%` : '—',
        subtext: k.bestProperty?.name || '',
        valueClassName: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'Worst property',
        value: k.worstProperty ? `${k.worstProperty.rate.toFixed(1)}%` : '—',
        subtext: k.worstProperty?.name || '',
        valueClassName: 'text-yellow-700 dark:text-yellow-400',
      },
    ]
  }, [k, payload, filters.propertyId, properties])

  const periodLabel =
    filters.period === 'custom' && filters.startDate && filters.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : filters.period

  const exportRows = React.useMemo(() => {
    return (payload?.byProperty || []).map((row) => ({
      property: row.propertyName,
      billedTotal: kes(row.billedTotal),
      billedRent: kes(row.billedRent),
      billedWater: kes(row.billedWater),
      collectedTotal: kes(row.collectedTotal),
      collectionRate: `${row.collectionRate.toFixed(1)}%`,
      arrearsNow: kes(row.arrearsNow),
    }))
  }, [payload?.byProperty])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return

    const filename = `revenue-report-${filters.period}-${filters.propertyId}-${new Date()
      .toISOString()
      .slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Revenue Report — Billed vs Collected',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Billed (Total)', accessor: (row: any) => row.billedTotal },
      { header: 'Rent billed', accessor: (row: any) => row.billedRent },
      { header: 'Water billed', accessor: (row: any) => row.billedWater },
      { header: 'Collected', accessor: (row: any) => row.collectedTotal },
      { header: 'Collection %', accessor: (row: any) => row.collectionRate },
      { header: 'Arrears (Now)', accessor: (row: any) => row.arrearsNow },
    ]

    const totalArrears = (payload.byProperty || []).reduce((sum, row) => sum + Number(row.arrearsNow || 0), 0)
    const summaryRows = [
      [
        'TOTAL',
        kes(payload.kpis.billedTotal),
        kes(payload.kpis.billedRent),
        kes(payload.kpis.billedWater),
        kes(payload.kpis.collectedTotal),
        '',
        kes(totalArrears),
      ],
    ]

    const periodLabel =
      filters.period === 'custom' && filters.startDate && filters.endDate
        ? `${filters.startDate} to ${filters.endDate}`
        : filters.period
    const scopeLabel =
      filters.propertyId === 'all'
        ? 'All properties'
        : payload.properties.find((p) => p.id === filters.propertyId)?.name || 'Single property'
    const subtitle = `Period: ${periodLabel}. Scope: ${scopeLabel}.`

    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Revenue Report — Billed vs Collected',
        subtitle,
        summaryRows,
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, exportRows, summaryRows, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, exportRows, summaryRows, { letterhead })
    }
  }

  const columnDefs = React.useMemo<ColDef<PropertyRow>[]>(
    () => [
      { headerName: 'Property', field: 'propertyName', minWidth: 180, flex: 1 },
      {
        headerName: 'Billed (Total)',
        field: 'billedTotal',
        minWidth: 160,
        valueFormatter: (p) => kes(Number(p.value || 0)),
        filter: 'agNumberColumnFilter',
      },
      {
        headerName: 'Rent billed',
        field: 'billedRent',
        minWidth: 140,
        valueFormatter: (p) => kes(Number(p.value || 0)),
        filter: 'agNumberColumnFilter',
      },
      {
        headerName: 'Water billed',
        field: 'billedWater',
        minWidth: 140,
        valueFormatter: (p) => kes(Number(p.value || 0)),
        filter: 'agNumberColumnFilter',
      },
      {
        headerName: 'Collected',
        field: 'collectedTotal',
        minWidth: 140,
        valueFormatter: (p) => kes(Number(p.value || 0)),
        filter: 'agNumberColumnFilter',
      },
      {
        headerName: 'Collection %',
        field: 'collectionRate',
        minWidth: 140,
        valueFormatter: (p) => `${Number(p.value || 0).toFixed(1)}%`,
        filter: 'agNumberColumnFilter',
      },
      {
        headerName: 'Arrears (Now)',
        field: 'arrearsNow',
        minWidth: 140,
        valueFormatter: (p) => kes(Number(p.value || 0)),
        filter: 'agNumberColumnFilter',
      },
    ],
    []
  )

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/manager/reports">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Revenue Report</h1>
                <p className="text-sm text-muted-foreground">
                  Billed vs collected performance, invoice type split, and property rankings.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
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
              <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8" />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Billed Breakdown (Rent vs Water)</CardTitle>
                    <CardDescription>Stacked billed values by invoice type.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={perfConfig} className="h-[280px] w-full">
                      <BarChart data={payload?.timeseries || []} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="billedRent" stackId="billed" fill="var(--color-billedRent)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="billedWater" stackId="billed" fill="var(--color-billedWater)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top Properties by Collected</CardTitle>
                    <CardDescription>Top 10 properties ranked by collected amount.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={perfConfig} className="h-[280px] w-full">
                      <BarChart
                        data={payload?.topProperties || []}
                        layout="vertical"
                        margin={{ left: 12, right: 16 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <YAxis
                          dataKey="propertyName"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          hide
                        />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tickFormatter={(value) => `KES ${kesAbbrev(Number(value || 0))}`}
                        />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                        <Bar dataKey="collectedTotal" fill="#2563eb" radius={6}>
                          <LabelList
                            dataKey="propertyName"
                            position="insideLeft"
                            offset={8}
                            className="fill-white"
                            fontSize={12}
                          />
                          <LabelList
                            dataKey="collectedTotal"
                            position="insideRight"
                            offset={8}
                            className="fill-white"
                            fontSize={12}
                            formatter={(value: number) => kesAbbrev(Number(value || 0))}
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Property Revenue Table</CardTitle>
                  <CardDescription>Sortable table; use exports for finance packs and board reporting.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<PropertyRow>
                      theme="legacy"
                      rowData={payload?.byProperty || []}
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
                      onRowClicked={(event) => {
                        if (!event.data) return
                        setSelectedRow(event.data)
                        setDetailOpen(true)
                        event.node.setSelected(true)
                      }}
                    />
                  </div>

                  {!payload?.byProperty?.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">No property revenue data found for this scope.</div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setSelectedRow(null)
        }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Property revenue details</DialogTitle>
            <DialogDescription>Deep dive for the selected property.</DialogDescription>
          </DialogHeader>

          {selectedRow ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Property</p>
                  <p className="text-base font-semibold">{selectedRow.propertyName}</p>
                  <p className="text-sm text-muted-foreground">Period: {periodLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Collection rate</p>
                  <p className="text-base font-semibold text-emerald-700">
                    {selectedRow.collectionRate.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Billed total</p>
                  <p className="text-lg font-bold">{kes(selectedRow.billedTotal)}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Rent billed</p>
                  <p className="text-lg font-bold">{kes(selectedRow.billedRent)}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Water billed</p>
                  <p className="text-lg font-bold">{kes(selectedRow.billedWater)}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <p className="text-lg font-bold text-emerald-700">{kes(selectedRow.collectedTotal)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground">Arrears now</p>
                  <p className="text-sm font-medium">{kes(selectedRow.arrearsNow)}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground">Net (period)</p>
                  <p className="text-sm font-medium">
                    {kes(selectedRow.collectedTotal - selectedRow.billedTotal)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">No row selected.</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              disabled={!selectedRow?.propertyId}
              onClick={() => {
                if (!selectedRow?.propertyId) return
                router.push(`/dashboard/properties/${selectedRow.propertyId}`)
                setDetailOpen(false)
              }}
            >
              View property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
