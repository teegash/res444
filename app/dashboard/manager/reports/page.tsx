'use client'

import * as React from 'react'
import Link from 'next/link'
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
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'

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
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

const performanceConfig = {
  billed: { label: 'Billed', color: 'var(--chart-2)' },
  collected: { label: 'Collected', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-3)' },
  net: { label: 'Net', color: 'var(--chart-4)' },
} satisfies ChartConfig

const statusConfig = {
  occupied: { label: 'Occupied', color: 'var(--chart-1)' },
  notice: { label: 'Notice', color: 'var(--chart-2)' },
  vacant: { label: 'Vacant', color: 'var(--chart-3)' },
  renovating: { label: 'Renovating', color: 'var(--chart-4)' },
  unknown: { label: 'Unknown', color: 'var(--chart-5)' },
} satisfies ChartConfig

export default function ReportsOverviewPage() {
  const { toast } = useToast()

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'quarter',
    propertyId: 'all',
    groupBy: 'month',
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
  }, [filters.period, filters.propertyId, filters.groupBy, toast])

  React.useEffect(() => {
    load()
  }, [load])

  const properties = payload?.properties || []
  const kpis = payload?.kpis

  const kpiTiles = React.useMemo(() => {
    if (!kpis) return []
    return [
      {
        label: 'Billed (period)',
        value: kes(kpis.billed),
        subtext: payload?.range?.start
          ? `${payload.range.start} to ${payload.range.end}`
          : `Up to ${payload?.range?.end}`,
      },
      { label: 'Collected (period)', value: kes(kpis.collected) },
      { label: 'Collection rate', value: `${kpis.collectionRate.toFixed(1)}%` },
      { label: 'Expenses (period)', value: kes(kpis.expenses) },
      { label: 'Net (period)', value: kes(kpis.net) },
      { label: 'Arrears outstanding (now)', value: kes(kpis.arrearsNow) },
      {
        label: 'Occupancy rate',
        value: `${kpis.occupancyRate.toFixed(1)}%`,
        subtext: `${kpis.totalUnits.toLocaleString()} units`,
      },
      { label: 'Defaulters (overdue rent)', value: kpis.defaultersCount.toLocaleString() },
    ]
  }, [kpis, payload?.range])

  const statusData = React.useMemo(() => {
    const status = payload?.unitStatus || {}
    const keys = ['occupied', 'notice', 'vacant', 'renovating']
    const rows = keys.map((key) => ({ name: key, value: Number(status[key] || 0) }))
    const unknown = Object.keys(status).reduce((acc, key) => {
      if (keys.includes(key)) return acc
      return acc + Number(status[key] || 0)
    }, 0)
    if (unknown) rows.push({ name: 'unknown', value: unknown })
    return rows.filter((row) => row.value > 0)
  }, [payload?.unitStatus])

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
              <ReportFilters value={filters} onChange={setFilters} properties={properties} />

              <KpiTiles items={kpiTiles as any} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Billed vs Collected</CardTitle>
                    <CardDescription>
                      Billed is bucketed by invoice.period_start. Collected uses payments.payment_date.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <AreaChart data={payload?.timeseries || []} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          dataKey="billed"
                          type="monotone"
                          fill="var(--color-billed)"
                          stroke="var(--color-billed)"
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
                    <CardDescription>Collected vs Expenses per bucket. Net = collected - expenses.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <BarChart data={payload?.timeseries || []} margin={{ left: 12, right: 12 }}>
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
                    <CardTitle className="text-base">Unit Status Distribution</CardTitle>
                    <CardDescription>Snapshot of unit states in selected scope.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={statusConfig} className="h-[280px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Pie
                          data={statusData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          strokeWidth={2}
                        />
                      </PieChart>
                    </ChartContainer>
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
            </>
          )}
        </main>
      </div>
    </div>
  )
}
