'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { ArrowLeft, Download, Home } from 'lucide-react'

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
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'

ModuleRegistry.registerModules([AllCommunityModule])

type OccupancyPayload = {
  range: { start: string | null; end: string }
  properties: Array<{ id: string; name: string }>
  kpis: {
    totalUnits: number
    occupied: number
    notice: number
    vacant: number
    renovating: number
    occupancyRate: number
  }
  statusDonut: Array<{ name: string; value: number }>
  byProperty: Array<{
    propertyId: string
    propertyName: string
    totalUnits: number
    occupied: number
    notice: number
    vacant: number
    renovating: number
    unknown: number
    occupancyRate: number
  }>
  units: Array<{
    id: string
    unit_number: string
    status: string
    notice_vacate_date: string | null
    building_id: string
    building_name: string
    lease_id: string | null
    lease_start: string | null
    lease_end: string | null
    lease_status: string | null
    tenant_user_id: string | null
    tenant_name: string | null
  }>
}

const statusConfig = {
  occupied: { label: 'Occupied', color: '#22c55e' },
  notice: { label: 'Notice', color: '#8b5cf6' },
  vacant: { label: 'Vacant', color: '#facc15' },
  renovating: { label: 'Maintenance', color: '#f97316' },
  unknown: { label: 'Unknown', color: '#94a3b8' },
} satisfies ChartConfig

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

function occupancyTone(rate: number) {
  if (rate <= 50) return 'text-rose-600 dark:text-rose-400'
  if (rate <= 70) return 'text-orange-500 dark:text-orange-400'
  if (rate <= 90) return 'text-amber-500 dark:text-amber-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

function formatStatus(value: string | null | undefined) {
  if (!value) return '—'
  if (value === 'renovating') return 'maintenance'
  return value.replace(/_/g, ' ')
}

function formatLeaseStatus(value: string | null | undefined) {
  if (!value) return '—'
  if (value === 'renovating') return 'maintenance'
  return value.replace(/_/g, ' ')
}

const RETURN_TO_OCCUPANCY = encodeURIComponent('/dashboard/manager/reports/occupancy')

export default function OccupancyReportPage() {
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
  const [payload, setPayload] = React.useState<OccupancyPayload | null>(null)

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
      const res = await fetch(`/api/manager/reports/occupancy?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load occupancy report.')
      setPayload(json.data)
    } catch (e: any) {
      toast({
        title: 'Occupancy report failed',
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
        label: 'Occupancy rate',
        value: pct(k.occupancyRate),
        subtext: scopeLabel,
        valueClassName: occupancyTone(k.occupancyRate),
      },
      { label: 'Total units', value: k.totalUnits.toLocaleString() },
      { label: 'Occupied', value: k.occupied.toLocaleString() },
      { label: 'Notice', value: k.notice.toLocaleString(), subtext: 'Vacate date tracked' },
      { label: 'Vacant', value: k.vacant.toLocaleString() },
      { label: 'Maintenance', value: k.renovating.toLocaleString() },
    ]
  }, [k, payload, filters.propertyId, properties])

  const exportRows = React.useMemo(() => {
    return (payload?.byProperty || []).map((row) => ({
      property: row.propertyName,
      totalUnits: row.totalUnits,
      occupancyRate: `${row.occupancyRate.toFixed(1)}%`,
      occupied: row.occupied,
      notice: row.notice,
      vacant: row.vacant,
      renovating: row.renovating,
      unknown: row.unknown,
    }))
  }, [payload?.byProperty])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return

    const filename = `occupancy-report-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Occupancy Report — Unit State & Vacancy Management',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Total Units', accessor: (row: any) => String(row.totalUnits) },
      { header: 'Occupancy %', accessor: (row: any) => row.occupancyRate },
      { header: 'Occupied', accessor: (row: any) => String(row.occupied) },
      { header: 'Notice', accessor: (row: any) => String(row.notice) },
      { header: 'Vacant', accessor: (row: any) => String(row.vacant) },
      { header: 'Maintenance', accessor: (row: any) => String(row.renovating) },
    ]

    const summaryRows = [
      [
        'TOTAL / PORTFOLIO',
        String(payload.kpis.totalUnits),
        '',
        String(payload.kpis.occupied),
        String(payload.kpis.notice),
        String(payload.kpis.vacant),
        String(payload.kpis.renovating),
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
        title: 'Occupancy Report — Unit State & Vacancy Management',
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

  const propertyStackData = payload?.byProperty || []
  const statusDonut = React.useMemo(() => {
    return (payload?.statusDonut || [])
      .filter((item) => item.name !== 'unknown')
      .map((item) => ({
        ...item,
        fill: statusConfig[item.name]?.color || '#94a3b8',
      }))
  }, [payload?.statusDonut])

  const columnDefs = React.useMemo<ColDef<OccupancyPayload['units'][number]>[]>(
    () => [
      {
        headerName: 'Property',
        field: 'building_name',
        minWidth: 180,
        filter: true,
      },
      {
        headerName: 'Unit',
        field: 'unit_number',
        width: 110,
        filter: true,
      },
      {
        headerName: 'Tenant',
        field: 'tenant_name',
        minWidth: 180,
        filter: true,
      },
      {
        headerName: 'Status',
        field: 'status',
        width: 140,
        valueFormatter: (params) => formatStatus(params.value),
        cellClass: 'capitalize',
        filter: true,
      },
      {
        headerName: 'Notice vacate',
        field: 'notice_vacate_date',
        width: 150,
        filter: 'agDateColumnFilter',
      },
      {
        headerName: 'Lease start',
        field: 'lease_start',
        width: 140,
        filter: 'agDateColumnFilter',
      },
      {
        headerName: 'Lease end',
        field: 'lease_end',
        width: 140,
        filter: 'agDateColumnFilter',
      },
      {
        headerName: 'Lease status',
        field: 'lease_status',
        width: 140,
        valueFormatter: (params) => formatLeaseStatus(params.value),
        cellClass: 'capitalize',
        filter: true,
      },
      {
        headerName: 'Actions',
        field: 'tenant_user_id',
        minWidth: 140,
        cellRenderer: (params: any) => {
          const row = params.data as OccupancyPayload['units'][number]
          if (!row?.tenant_user_id) {
            return <span className="text-sm text-muted-foreground">No lease</span>
          }
          return (
            <Link
              href={`/dashboard/tenants/${row.tenant_user_id}/lease?returnTo=${RETURN_TO_OCCUPANCY}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View lease
            </Link>
          )
        },
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
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/dashboard/manager/reports')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Occupancy Report</h1>
                <p className="text-sm text-muted-foreground">
                  Unit status distribution, occupancy by property, and notice vacate visibility.
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

              <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Unit Status Distribution</CardTitle>
                    <CardDescription>Portfolio snapshot across vacant, maintenance, occupied and notice.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={statusConfig} className="h-[280px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Pie
                          data={statusDonut}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          strokeWidth={2}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                  <CardTitle className="text-base">Occupancy Rate by Property</CardTitle>
                  <CardDescription>Ranked percentage: (occupied + notice) / total units.</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <ChartContainer config={statusConfig} className="h-[280px] w-full">
                    <BarChart data={propertyStackData} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={6}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <YAxis type="category" dataKey="propertyName" tickLine={false} axisLine={false} width={140} hide />
                      <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                      <Bar dataKey="occupancyRate" fill="#1d4ed8" radius={6}>
                        <LabelList
                          dataKey="propertyName"
                          position="insideLeft"
                          offset={8}
                          className="fill-white"
                          fontSize={12}
                        />
                        <LabelList
                          dataKey="occupancyRate"
                          position="insideRight"
                          offset={8}
                          className="fill-white"
                          fontSize={12}
                          formatter={(value: number) => `${Number(value || 0).toFixed(1)}%`}
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

                <Card className="border bg-background lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Unit Status Breakdown by Property</CardTitle>
                    <CardDescription>Operational planning view: vacancy, notice pipeline, and renovation load.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={statusConfig} className="h-[320px] w-full">
                      <BarChart data={propertyStackData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="propertyName" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="occupied" stackId="s" fill="var(--color-occupied)" />
                        <Bar dataKey="notice" stackId="s" fill="var(--color-notice)" />
                        <Bar dataKey="vacant" stackId="s" fill="var(--color-vacant)" />
                        <Bar dataKey="renovating" stackId="s" fill="var(--color-renovating)" />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Units — Status & Notice Vacate</CardTitle>
                  <CardDescription>
                    Table includes notice_vacate_date for units in notice state. Use it to plan renewals, inspections and re-letting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<OccupancyPayload['units'][number]>
                      theme="legacy"
                      rowData={payload?.units || []}
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
                    />
                  </div>

                  {!payload?.units?.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">No units found for this scope.</div>
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
