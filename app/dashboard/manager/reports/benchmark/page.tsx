'use client'

import * as React from 'react'
import { usePrintMode } from '@/components/reports/usePrintMode'
import { SSExportButton } from '@/components/reports/SSExportButton'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonLoader } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import { ReportFilters, type ReportFilterState } from '@/components/reports/ReportFilters'
import { KpiTiles } from '@/components/reports/KpiTiles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Download, Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { EChart, type EChartsOption } from '@/components/charts/EChart'
import { RadialMiniKpi } from '@/components/reports/benchmark/RadialMiniKpi'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

type Row = {
  propertyId: string
  propertyName: string
  billed: number
  collected: number
  collectionRate: number
  arrearsNow: number
  occupancyRate: number
  unitCount: number
  occupiedLikeCount: number
  expenses: number
  noi: number
  noiMargin: number
}

type Payload = {
  range: { start: string | null; end: string }
  properties: Array<{ id: string; name: string }>
  benchmarks: {
    medianCollectionRate: number
    avgCollectionRate: number
    topProperty: { name: string; rate: number } | null
    bottomProperty: { name: string; rate: number } | null
    spread: number
    underperformers: number
  }
  rows: Row[]
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

function buildGaugeOption(rows: Row[], activeIndex: number): EChartsOption {
  const row = rows[activeIndex] || null
  const val = row ? Number(row.collectionRate.toFixed(2)) : 0

  return {
    title: [
      { text: 'Property Spotlight — Collection Rate', left: 'left' },
      {
        text: row ? row.propertyName : '—',
        left: 'left',
        top: 28,
        textStyle: { fontSize: 14, fontWeight: 'normal' },
      },
    ],
    tooltip: { formatter: '{a}<br/>{b}: {c}%' },
    series: [
      {
        name: 'Collection Rate',
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        pointer: { show: false },
        progress: { show: true, overlap: false, roundCap: true, clip: false },
        axisLine: { lineStyle: { width: 24 } },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        data: [
          {
            value: val,
            name: 'Collected / Billed',
            title: { offsetCenter: ['0%', '-10%'] },
            detail: { valueAnimation: true, offsetCenter: ['0%', '12%'] },
          },
        ],
        title: { fontSize: 12 },
        detail: {
          width: 90,
          height: 22,
          fontSize: 18,
          borderRadius: 999,
          borderWidth: 1,
          formatter: '{value}%',
        },
      },
    ],
  }
}

function buildPolarOption(rows: Row[]): EChartsOption {
  const top = [...rows].sort((a, b) => b.collectionRate - a.collectionRate).slice(0, 8)
  const labels = top.map((x) => x.propertyName)
  const values = top.map((x) => Number(x.collectionRate.toFixed(2)))

  return {
    title: [
      {
        text: 'Property Collection %',
      },
    ],
    polar: {
      radius: [30, '80%'],
    },
    angleAxis: {
      max: 100,
      startAngle: 75,
    },
    radiusAxis: {
      type: 'category',
      data: labels,
    },
    tooltip: {},
    series: {
      type: 'bar',
      data: values,
      coordinateSystem: 'polar',
      label: { show: false },
    },
  }
}

export default function BenchmarkReportPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'year',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })
  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<Payload | null>(null)
  const [spotlightIndex, setSpotlightIndex] = React.useState(0)
  const gridApiRef = React.useRef<GridApi | null>(null)
  const { isPrinting, triggerPrint } = usePrintMode({
    onBeforePrint: () => {
      window.dispatchEvent(new Event('resize'))
    },
    printDelayMs: 120,
  })

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
      })
      if (filters.period === 'custom' && filters.startDate && filters.endDate) {
        qs.set('startDate', filters.startDate)
        qs.set('endDate', filters.endDate)
      }
      const res = await fetch(`/api/manager/reports/benchmark?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load benchmark report.')
      setPayload(json.data)
      setSpotlightIndex(0)
    } catch (e: any) {
      toast({ title: 'Benchmark report failed', description: e?.message || 'Try again.', variant: 'destructive' })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [filters.period, filters.propertyId, filters.startDate, filters.endDate, toast])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (!payload?.rows?.length) return
    const t = setInterval(() => {
      setSpotlightIndex((i) => (i + 1) % payload.rows.length)
    }, 2500)
    return () => clearInterval(t)
  }, [payload?.rows?.length])

  const kpis = React.useMemo(() => {
    if (!payload) return []
    const b = payload.benchmarks
    return [
      { label: 'Median Collection %', value: `${b.medianCollectionRate.toFixed(1)}%` },
      { label: 'Average Collection %', value: `${b.avgCollectionRate.toFixed(1)}%` },
      {
        label: 'Top Property',
        value: b.topProperty ? `${b.topProperty.rate.toFixed(1)}%` : '—',
        valueClassName: 'text-emerald-600',
        subtext: b.topProperty?.name || '',
      },
      {
        label: 'Bottom Property',
        value: b.bottomProperty ? `${b.bottomProperty.rate.toFixed(1)}%` : '—',
        valueClassName: 'text-rose-600',
        subtext: b.bottomProperty?.name || '',
      },
      { label: 'Spread', value: `${b.spread.toFixed(1)}%`, subtext: 'Top − Bottom' },
      {
        label: 'Underperformers',
        value: String(b.underperformers),
        subtext: 'Below portfolio median',
        cardClassName: 'bg-rose-100/90 border-rose-200 dark:bg-rose-950/35 dark:border-rose-800/60',
      },
    ]
  }, [payload])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return
    const filename = `peer-benchmark-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Peer Benchmark Report — Property Performance',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (r: any) => r.propertyName },
      { header: 'Collected', accessor: (r: any) => kes(r.collected) },
      { header: 'Billed', accessor: (r: any) => kes(r.billed) },
      { header: 'Collection %', accessor: (r: any) => `${r.collectionRate.toFixed(1)}%` },
      { header: 'Arrears (Now)', accessor: (r: any) => kes(r.arrearsNow) },
      { header: 'Occupancy %', accessor: (r: any) => `${r.occupancyRate.toFixed(1)}%` },
      { header: 'Expenses', accessor: (r: any) => kes(r.expenses) },
      { header: 'NOI', accessor: (r: any) => kes(r.noi) },
      { header: 'NOI Margin %', accessor: (r: any) => `${r.noiMargin.toFixed(1)}%` },
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
      exportRowsAsPDF(filename, columns, payload.rows, {
        title: 'Peer Benchmark Report — Property Performance',
        subtitle,
        summaryRows: [],
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, payload.rows, [], { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, payload.rows, [], { letterhead })
    }
  }

  const gaugeOption = React.useMemo(() => {
    if (!payload?.rows?.length) return {} as EChartsOption
    return buildGaugeOption(payload.rows, spotlightIndex)
  }, [payload?.rows, spotlightIndex])

  const polarOption = React.useMemo(() => {
    if (!payload?.rows?.length) return {} as EChartsOption
    return buildPolarOption(payload.rows)
  }, [payload?.rows])

  const safePct = React.useCallback((n: number, d: number) => {
    if (!d || d <= 0) return 0
    return (n / d) * 100
  }, [])

  const radial = React.useMemo(() => {
    const rows = payload?.rows || []
    const totals = rows.reduce(
      (acc, row) => {
        acc.collected += Number(row.collected || 0)
        acc.billed += Number(row.billed || 0)
        acc.arrears += Number(row.arrearsNow || 0)
        acc.noi += Number(row.noi || 0)
        acc.units += Number(row.unitCount || 0)
        acc.occupiedLike += Number(row.occupiedLikeCount || 0)
        return acc
      },
      { collected: 0, billed: 0, arrears: 0, noi: 0, units: 0, occupiedLike: 0 }
    )

    const avgOccupancy = totals.units ? safePct(totals.occupiedLike, totals.units) : 0
    const collectionRate = safePct(totals.collected, totals.billed)
    const noiMargin = safePct(totals.noi, totals.collected)
    const billedBaseline = Math.max(1, totals.billed)

    return {
      totalCollected: totals.collected,
      totalBilled: totals.billed,
      totalArrears: totals.arrears,
      totalNOI: totals.noi,
      avgOccupancy,
      collectionRate,
      noiMargin,
      billedBaseline,
    }
  }, [payload?.rows, safePct])

  const columnDefs = React.useMemo<ColDef<Row>[]>(
    () => [
      { headerName: 'Property', field: 'propertyName', minWidth: 200, flex: 2, filter: true },
      {
        headerName: 'Collected',
        field: 'collected',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Billed',
        field: 'billed',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Collection %',
        field: 'collectionRate',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
      {
        headerName: 'Arrears',
        field: 'arrearsNow',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Occupancy %',
        field: 'occupancyRate',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
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
        headerName: 'NOI Margin %',
        field: 'noiMargin',
        minWidth: 150,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
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
          <div className="no-print flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/dashboard/manager/reports')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Peer Benchmark</h1>
                <p className="text-sm text-muted-foreground">
                  Compare performance across properties: collection efficiency, arrears exposure, occupancy and NOI.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SSExportButton onClick={triggerPrint} ariaLabel="Export peer benchmark" />
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
          </div>

          <section id="print-root" className="space-y-6">
            <div className="print-only print-letterhead">
              <div className="text-lg font-semibold">Peer Benchmark</div>
              <div className="text-xs text-slate-600">Generated: {new Date().toLocaleString()}</div>
              <div className="mt-1 text-xs text-slate-600">
                Scope:{' '}
                {filters.propertyId === 'all'
                  ? 'All properties'
                  : payload?.properties?.find((p) => p.id === filters.propertyId)?.name || 'Selected property'}{' '}
                • Period: {filters.period}
                {filters.period === 'custom' && filters.startDate && filters.endDate
                  ? ` (${filters.startDate} → ${filters.endDate})`
                  : ''}
              </div>
            </div>

            {loading ? (
              <SkeletonLoader />
            ) : (
              <>
                <div className="no-print">
                  <ReportFilters value={filters} onChange={handleFiltersChange} properties={payload?.properties || []} />
                </div>
                <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-6" />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <RadialMiniKpi
                  title="Collection Rate"
                  subtitle="Portfolio (YTD/period)"
                  value={radial.collectionRate}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                  valueColor="hsl(0 84% 60%)"
                  remainderColor="hsl(142 72% 45%)"
                />
                <RadialMiniKpi
                  title="Collected"
                  subtitle="Cash inflow"
                  value={radial.totalCollected}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                  valueColor="hsl(142 72% 45%)"
                  remainderColor="hsl(0 84% 60%)"
                />
                <RadialMiniKpi
                  title="Billed"
                  subtitle="Invoice issuance"
                  value={radial.totalBilled}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                />
                <RadialMiniKpi
                  title="Arrears Exposure"
                  subtitle="Overdue unpaid / billed"
                  value={radial.totalArrears}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                  remainderColor="#4169E1"
                  remainderLabel="Invoiced"
                  tooltipRemainderValue={radial.totalBilled}
                />
                <RadialMiniKpi
                  title="Occupancy"
                  subtitle="Portfolio weighted"
                  value={radial.avgOccupancy}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                />
                <RadialMiniKpi
                  title="NOI Margin"
                  subtitle="NOI / Collected"
                  value={radial.noiMargin}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background report-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Spotlight Gauge (Auto-rotating)</CardTitle>
                    <CardDescription>Cycles through properties to highlight collection performance.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EChart option={gaugeOption} className="h-[320px] w-full" />
                  </CardContent>
                </Card>

                <Card className="border bg-background report-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Polar Benchmark</CardTitle>
                    <CardDescription>High-visibility comparative chart of top collection rates.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EChart option={polarOption} className="h-[320px] w-full" />
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background report-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Benchmark Table</CardTitle>
                  <CardDescription>
                    Enterprise grid with sorting, filtering, and column resizing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: isPrinting ? undefined : 520 }}
                  >
                    <AgGridReact<Row>
                      rowData={payload?.rows || []}
                      columnDefs={columnDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: true,
                      }}
                      domLayout={isPrinting ? 'print' : 'normal'}
                      pagination={!isPrinting}
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
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
