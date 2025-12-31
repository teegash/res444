'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, BarChart3 } from 'lucide-react'
import * as echarts from 'echarts'

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
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { ParticleButton } from '@/components/ui/particle-button'

type OverviewPayload = {
  range: { start: string | null; end: string }
  groupBy: 'day' | 'week' | 'month'
  properties: Array<{ id: string; name: string }>
  kpis: {
    billed: number
    collected: number
    collectionRate: number
    expenses: number
    net: number
    arrearsNow: number
    defaultersCount: number
    totalUnits: number
    occupancyRate: number
  }
  unitStatus: Record<string, number>
  timeseries: Array<{ period: string; billed: number; collected: number; expenses: number; net: number }>
  propertyRows: Array<{
    propertyId: string
    propertyName: string
    billed: number
    collected: number
    expenses: number
    net: number
    arrearsNow: number
    collectionRate: number
  }>
  maintenanceCalendar?: {
    month: string
    data: Array<[string, number]>
    max: number
  }
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

const performanceConfig = {
  unpaid: { label: 'Rent unpaid', color: '#4c1d95' },
  collected: { label: 'Collected', color: '#16a34a' },
  expenses: { label: 'Expenses', color: '#ef4444' },
  net: { label: 'Net', color: '#1d4ed8' },
} satisfies ChartConfig

export default function ReportsOverviewPage() {
  const { toast } = useToast()
  const router = useRouter()
  const calendarRef = React.useRef<HTMLDivElement | null>(null)

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'quarter',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })

  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<OverviewPayload | null>(null)

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

      const res = await fetch(`/api/manager/reports/overview?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load reports overview.')

      setPayload(json.data)
    } catch (err: any) {
      toast({
        title: 'Reports overview failed',
        description: err?.message || 'Please try again.',
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

  const properties = payload?.properties || []
  const kpis = payload?.kpis

  const kpiTiles = React.useMemo(() => {
    if (!kpis) return []
    return [
      {
        label: 'Billed (period)',
        value: kes(kpis.billed),
      },
      {
        label: 'Collected (period)',
        value: kes(kpis.collected),
        valueClassName: 'text-emerald-600 dark:text-emerald-400',
      },
      { label: 'Collection rate', value: `${kpis.collectionRate.toFixed(1)}%` },
      { label: 'Expenses (period)', value: kes(kpis.expenses) },
      { label: 'Net (period)', value: kes(kpis.net) },
      {
        label: 'Arrears',
        value: kes(kpis.arrearsNow),
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
      {
        label: 'Occupancy rate',
        value: `${kpis.occupancyRate.toFixed(1)}%`,
        subtext: `${kpis.totalUnits.toLocaleString()} units`,
      },
      { label: 'Defaulters (overdue)', value: kpis.defaultersCount.toLocaleString() },
    ]
  }, [kpis, payload?.range])

  const chartSeries = React.useMemo(() => {
    return (payload?.timeseries || []).map((row) => ({
      ...row,
      unpaid: row.billed,
    }))
  }, [payload?.timeseries])

  React.useEffect(() => {
    const node = calendarRef.current
    if (!node) return

    const chart = echarts.init(node)
    const calendarData = payload?.maintenanceCalendar?.data || []
    const monthKey = payload?.maintenanceCalendar?.month || new Date().toISOString().slice(0, 7)
    const maxValue = payload?.maintenanceCalendar?.max || 0
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    const labelColor = isDark ? '#e2e8f0' : '#0f172a'

    const option: echarts.EChartsOption = {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const date = params?.data?.[0] || params?.name
          const value = params?.data?.[1] ?? 0
          if (!date) return ''
          return `${date}<br/>Maintenance requests: ${value}`
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(maxValue, 1),
        show: false,
        inRange: {
          color: ['#fff7ed', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c'],
        },
      },
      calendar: {
        range: monthKey,
        cellSize: [18, 18],
        orient: 'horizontal',
        left: 44,
        right: 8,
        top: 24,
        bottom: 8,
        yearLabel: { show: false },
        monthLabel: {
          nameMap: 'en',
          margin: 14,
          position: 'start',
          align: 'left',
          color: labelColor,
          fontWeight: 600,
        },
        dayLabel: {
          firstDay: 1,
          nameMap: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          margin: 12,
          position: 'start',
          color: labelColor,
          fontWeight: 600,
        },
        itemStyle: {
          borderWidth: 2,
          borderColor: '#ffffff',
          borderRadius: 4,
        },
      },
      series: {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: calendarData,
        itemStyle: {
          borderWidth: 1,
          borderColor: '#fff7ed',
          shadowBlur: 6,
          shadowColor: 'rgba(249, 115, 22, 0.18)',
          shadowOffsetY: 1,
        },
        emphasis: {
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fdba74',
            shadowBlur: 12,
            shadowColor: 'rgba(249, 115, 22, 0.45)',
            shadowOffsetY: -3,
          },
        },
      },
    }

    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [payload?.maintenanceCalendar])

  const exportRows = React.useMemo(() => {
    return (payload?.propertyRows || []).map((row) => ({
      property: row.propertyName,
      billed: kes(row.billed),
      collected: kes(row.collected),
      collectionRate: `${row.collectionRate.toFixed(1)}%`,
      expenses: kes(row.expenses),
      net: kes(row.net),
      arrearsNow: kes(row.arrearsNow),
    }))
  }, [payload?.propertyRows])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return

    const filename = `reports-overview-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Reports Overview - Portfolio Performance',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Billed', accessor: (row: any) => row.billed },
      { header: 'Collected', accessor: (row: any) => row.collected },
      { header: 'Collection %', accessor: (row: any) => row.collectionRate },
      { header: 'Expenses', accessor: (row: any) => row.expenses },
      { header: 'Net', accessor: (row: any) => row.net },
      { header: 'Arrears (Now)', accessor: (row: any) => row.arrearsNow },
    ]

    const summaryRows = [
      [
        'TOTAL',
        kes(payload.kpis.billed),
        kes(payload.kpis.collected),
        `${payload.kpis.collectionRate.toFixed(1)}%`,
        kes(payload.kpis.expenses),
        kes(payload.kpis.net),
        kes(payload.kpis.arrearsNow),
      ],
    ]

    if (format === 'pdf') {
      await exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Reports Overview - Portfolio Performance',
        subtitle: `Period: ${filters.period}. Scope: ${
          filters.propertyId === 'all' ? 'All properties' : 'Single property'
        }. Paid invoices are status_text='paid'. Payments use payment_date.`,
        summaryRows,
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      await exportRowsAsExcel(filename, columns, exportRows, summaryRows, { letterhead })
    } else {
      await exportRowsAsCSV(filename, columns, exportRows, summaryRows, { letterhead })
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
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Reports Overview</h1>
                <p className="text-sm text-muted-foreground">
                  Enterprise portfolio KPIs, trends, property comparisons, and exports.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shrink-0">
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
            <div className="space-y-4">
              <SkeletonLoader height={20} width="60%" />
              <SkeletonLoader height={16} width="40%" />
              <SkeletonTable rows={4} columns={4} />
            </div>
          ) : (
            <>
              <ReportFilters value={filters} onChange={handleFiltersChange} properties={properties} />

              <KpiTiles
                items={kpiTiles as any}
                className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rent Unpaid vs Collected</CardTitle>
                    <CardDescription>
                      Unpaid rent is invoiced rent that is pending confirmed payment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <AreaChart data={chartSeries} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          dataKey="unpaid"
                          type="monotone"
                          fill="var(--color-unpaid)"
                          stroke="var(--color-unpaid)"
                          fillOpacity={0.25}
                        />
                        <Area
                          dataKey="collected"
                          type="monotone"
                          fill="var(--color-collected)"
                          stroke="var(--color-collected)"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Cashflow</CardTitle>
                    <CardDescription>Net = collected - expenses.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <BarChart data={chartSeries} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="collected" fill="var(--color-collected)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="net" fill="var(--color-net)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Maintenance Request Calendar</CardTitle>
                    <CardDescription>
                      Darker orange means more requests on that day in the selected month.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div ref={calendarRef} className="h-[330px] w-full" />
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Collection Rate</CardTitle>
                    <CardDescription>Collected / Billed (period), based on your canonical rules.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <RadialBarChart
                        innerRadius={70}
                        outerRadius={120}
                        data={[
                          {
                            name: 'collection',
                            value: payload?.kpis?.collectionRate || 0,
                            fill: 'var(--color-collected)',
                          },
                        ]}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <RadialBar dataKey="value" background cornerRadius={10} />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                          <tspan className="text-2xl font-semibold">
                            {(payload?.kpis?.collectionRate || 0).toFixed(1)}%
                          </tspan>
                        </text>
                      </RadialBarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Property Performance</CardTitle>
                  <CardDescription>
                    Per property billed, collected, expenses, net, arrears. Click property to drill down.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="py-2 text-left">Property</th>
                          <th className="py-2 text-right">Billed</th>
                          <th className="py-2 text-right">Collected</th>
                          <th className="py-2 text-right">Collection %</th>
                          <th className="py-2 text-right">Expenses</th>
                          <th className="py-2 text-right">Net</th>
                          <th className="py-2 text-right">Arrears (Now)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(payload?.propertyRows || []).map((row) => (
                          <tr key={row.propertyId} className="border-b hover:bg-muted/40">
                            <td className="py-2">
                              <Link
                                href={`/dashboard/manager/reports/revenue?property=${row.propertyId}`}
                                className="font-medium hover:underline"
                              >
                                {row.propertyName}
                              </Link>
                            </td>
                            <td className="py-2 text-right">{kes(row.billed)}</td>
                            <td className="py-2 text-right">{kes(row.collected)}</td>
                            <td className="py-2 text-right">{row.collectionRate.toFixed(1)}%</td>
                            <td className="py-2 text-right">{kes(row.expenses)}</td>
                            <td className="py-2 text-right">{kes(row.net)}</td>
                            <td className="py-2 text-right">{kes(row.arrearsNow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!payload?.propertyRows?.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">
                      No property data found for this scope.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Actions</CardTitle>
                  <CardDescription>Jump into specialized reports for deeper analysis.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    {[
                      { label: 'Revenue report', href: '/dashboard/manager/reports/revenue' },
                      { label: 'Occupancy report', href: '/dashboard/manager/reports/occupancy' },
                      { label: 'Maintenance report', href: '/dashboard/manager/reports/maintenance-performance' },
                      { label: 'Financial statement', href: '/dashboard/manager/reports/financial-statement' },
                      { label: 'Report preview', href: '/dashboard/manager/reports/preview' },
                    ].map((item) => (
                      <ParticleButton
                        key={item.href}
                        variant="default"
                        className="h-10 w-full justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-b from-neutral-700 via-neutral-900 to-black px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_20px_-12px_rgba(0,0,0,0.8)] ring-1 ring-black/40 hover:from-neutral-600 hover:via-neutral-800 hover:to-neutral-950 sm:text-sm"
                        onClick={() => router.push(item.href)}
                      >
                        <span>{item.label}</span>
                      </ParticleButton>
                    ))}
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
