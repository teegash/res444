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
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react'
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

import { Bar, BarChart, CartesianGrid, LabelList, Pie, PieChart, XAxis, YAxis } from 'recharts'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

type ArrearsPayload = {
  range: { start: string | null; end: string }
  properties: Array<{ id: string; name: string }>
  todayISO: string
  kpis: {
    arrearsTotal: number
    arrearsRent: number
    arrearsWater: number
    defaultersCount: number
    overdueInvoicesCount: number
    arrearsRate: number
  }
  ageing: Array<{ bucket: string; amount: number }>
  byProperty: Array<{
    propertyId: string
    propertyName: string
    arrearsTotal: number
    arrearsRent: number
    arrearsWater: number
    invoicesCount: number
    defaultersCount: number
  }>
  defaulters: Array<{
    tenant_user_id: string | null
    tenant_name: string
    tenant_phone: string | null
    propertyId: string | null
    propertyName: string
    unitNumber: string
    arrearsTotal: number
    arrearsRent: number
    arrearsWater: number
    openInvoices: number
    oldestDueDate: string
    maxDaysOverdue: number
  }>
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

const arrearsConfig = {
  arrearsTotal: { label: 'Arrears', color: '#dc2626' },
  arrearsRent: { label: 'Rent arrears', color: '#f97316' },
  arrearsWater: { label: 'Water arrears', color: '#0ea5e9' },
} satisfies ChartConfig

const ageingConfig = {
  '0-30': { label: '0-30', color: '#22c55e' },
  '31-60': { label: '31-60', color: '#f59e0b' },
  '61-90': { label: '61-90', color: '#f97316' },
  '90+': { label: '90+', color: '#dc2626' },
} satisfies ChartConfig

export default function ArrearsReportPage() {
  const { toast } = useToast()
  const gridApiRef = React.useRef<GridApi | null>(null)
  const router = useRouter()

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'quarter',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })

  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<ArrearsPayload | null>(null)

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
      const res = await fetch(`/api/manager/reports/arrears?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load arrears report.')
      setPayload(json.data)
    } catch (e: any) {
      toast({
        title: 'Arrears report failed',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [filters.period, filters.propertyId, filters.startDate, filters.endDate, toast])

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
        label: 'Total arrears',
        value: kes(k.arrearsTotal),
        subtext: `${scopeLabel} • snapshot as of ${payload.todayISO}`,
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
      {
        label: 'Rent arrears',
        value: kes(k.arrearsRent),
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
      {
        label: 'Water arrears',
        value: kes(k.arrearsWater),
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
      {
        label: 'Defaulters',
        value: k.defaultersCount.toLocaleString(),
        subtext: 'Distinct tenant-unit cases',
      },
      { label: 'Overdue invoices', value: k.overdueInvoicesCount.toLocaleString() },
      {
        label: 'Arrears rate',
        value: `${k.arrearsRate.toFixed(1)}%`,
        subtext: 'Share of billed charges in selected period',
      },
    ]
  }, [k, payload, filters.propertyId, properties])

  const exportRows = React.useMemo(() => {
    return (payload?.defaulters || []).map((d) => ({
      tenant: d.tenant_name,
      phone: d.tenant_phone || '',
      property: d.propertyName,
      unit: d.unitNumber,
      arrearsTotal: kes(d.arrearsTotal),
      rentArrears: kes(d.arrearsRent),
      waterArrears: kes(d.arrearsWater),
      openInvoices: d.openInvoices,
      oldestDueDate: d.oldestDueDate,
      maxDaysOverdue: d.maxDaysOverdue,
    }))
  }, [payload?.defaulters])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return
    const filename = `arrears-report-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`

    const letterhead = {
      documentTitle: 'Arrears Report — Ageing & Defaulters',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Tenant', accessor: (row: any) => row.tenant },
      { header: 'Phone', accessor: (row: any) => row.phone },
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Unit', accessor: (row: any) => row.unit },
      { header: 'Arrears (Total)', accessor: (row: any) => row.arrearsTotal },
      { header: 'Rent arrears', accessor: (row: any) => row.rentArrears },
      { header: 'Water arrears', accessor: (row: any) => row.waterArrears },
      { header: 'Open invoices', accessor: (row: any) => String(row.openInvoices) },
      { header: 'Oldest due date', accessor: (row: any) => row.oldestDueDate },
      { header: 'Max days overdue', accessor: (row: any) => String(row.maxDaysOverdue) },
    ]

    const summaryRows = [
      [
        'TOTAL',
        '',
        '',
        '',
        kes(payload.kpis.arrearsTotal),
        kes(payload.kpis.arrearsRent),
        kes(payload.kpis.arrearsWater),
        '',
        '',
        '',
      ],
    ]

    const subtitle =
      `Arrears = invoices where status_text != 'paid' and due_date < today. ` +
      `Outstanding computed as amount - total_paid. Snapshot as of ${payload.todayISO}.`

    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Arrears Report — Ageing & Defaulters',
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

  const columnDefs = React.useMemo<ColDef<ArrearsPayload['defaulters'][number]>[]>(
    () => [
      { headerName: 'Tenant', field: 'tenant_name', minWidth: 180, filter: true },
      { headerName: 'Phone', field: 'tenant_phone', width: 140, filter: true },
      { headerName: 'Property', field: 'propertyName', minWidth: 180, filter: true },
      { headerName: 'Unit', field: 'unitNumber', width: 110, filter: true },
      {
        headerName: 'Arrears (Total)',
        field: 'arrearsTotal',
        width: 150,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Rent arrears',
        field: 'arrearsRent',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Water arrears',
        field: 'arrearsWater',
        width: 140,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      { headerName: 'Invoices', field: 'openInvoices', width: 110 },
      { headerName: 'Oldest due', field: 'oldestDueDate', width: 140 },
      { headerName: 'Days overdue', field: 'maxDaysOverdue', width: 140 },
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
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/dashboard/manager/reports')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Arrears Report</h1>
                <p className="text-sm text-muted-foreground">
                  Snapshot of overdue invoices, ageing buckets, property exposure, and defaulters list.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Defaulters
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
              <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <Card className="border bg-background lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Arrears Ageing</CardTitle>
                    <CardDescription>Outstanding amount bucketed by days overdue.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={ageingConfig} className="h-[280px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Pie
                          data={(payload?.ageing || []).map((row) => ({
                            name: row.bucket,
                            amount: row.amount,
                            fill: ageingConfig[row.bucket as keyof typeof ageingConfig]?.color || '#94a3b8',
                          }))}
                          dataKey="amount"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          strokeWidth={2}
                        />
                        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Arrears Exposure by Property</CardTitle>
                    <CardDescription>Ranked by total arrears amount.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={arrearsConfig} className="h-[280px] w-full">
                      <BarChart
                        data={payload?.byProperty?.slice(0, 10) || []}
                        layout="vertical"
                        margin={{ left: 12, right: 12 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="propertyName" tickLine={false} axisLine={false} hide />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Bar dataKey="arrearsTotal" fill="var(--color-arrearsTotal)" radius={[0, 6, 6, 0]}>
                          <LabelList
                            dataKey="propertyName"
                            position="insideLeft"
                            offset={8}
                            className="fill-white"
                            fontSize={12}
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Property Split — Rent vs Water Arrears</CardTitle>
                    <CardDescription>Highlights what is driving exposure per property.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={arrearsConfig} className="h-[320px] w-full">
                      <BarChart data={payload?.byProperty?.slice(0, 12) || []} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="propertyName" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="arrearsRent" stackId="a" fill="var(--color-arrearsRent)" />
                        <Bar dataKey="arrearsWater" stackId="a" fill="var(--color-arrearsWater)" />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Defaulters List</CardTitle>
                  <CardDescription>Highest exposure first.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<ArrearsPayload['defaulters'][number]>
                      rowData={payload?.defaulters || []}
                      columnDefs={columnDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: true,
                      }}
                      pagination
                      paginationPageSize={20}
                      animateRows
                      onGridReady={(params) => {
                        gridApiRef.current = params.api
                        params.api.sizeColumnsToFit()
                      }}
                      onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                    />
                  </div>

                  {!payload?.defaulters?.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">No arrears found for this scope.</div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
