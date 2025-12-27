'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { TrendingUp, TrendingDown, BarChart3, Eye, ArrowUpRight, Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { useToast } from '@/components/ui/use-toast'
import { SkeletonLoader, SkeletonPropertyCard, SkeletonTable } from '@/components/ui/skeletons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type PropertyMetric = {
  id?: string
  name: string
  units: string | number
  revenue: number
  avg: number
  occupancy: number
  collectionRate: number
  billed?: number
  location?: string
}

function GaugeCard({
  title,
  value,
  color = '#10b981',
}: {
  title: string
  value: number
  color?: string
}) {
  const percent = Math.min(Math.max(value, 0), 100)
  return (
    <Card className="relative overflow-hidden bg-white shadow-lg border-0">
      <CardContent className="p-4 flex flex-col items-center gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="relative w-32 h-16 overflow-hidden">
          <div
            className="absolute left-0 bottom-0 w-32 h-32 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(${color} ${percent * 1.8}deg, #e5e7eb ${percent * 1.8}deg 180deg)`,
              borderRadius: '9999px',
            }}
          >
            <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
              <p className="text-lg font-bold" style={{ color }}>
                {value.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('quarter')
  const [propertyScope, setPropertyScope] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyMetric[]>([])
  const [totals, setTotals] = useState({
    revenue: 0,
    occupancyRate: 0,
    collectionRate: 0,
    prevCollectionRate: 0,
    avgRent: 0,
  })
  const { toast } = useToast()

  const filteredProperties = useMemo(() => {
    if (propertyScope === 'all') return properties
    return properties.filter((p) => p.name === propertyScope || p.id === propertyScope)
  }, [propertyScope, properties])

  const summary = useMemo(() => {
    const totalRevenue = filteredProperties.reduce((sum, p) => sum + p.revenue, 0)
    const occupancy =
      filteredProperties.reduce((sum, p) => sum + (p.occupancy || 0), 0) /
      Math.max(1, filteredProperties.length)
    const collection =
      filteredProperties.reduce((sum, p) => sum + (p.collectionRate || 0), 0) /
      Math.max(1, filteredProperties.length)
    const avgRent =
      filteredProperties.reduce((sum, p) => sum + (p.avg || totals.avgRent), 0) /
      Math.max(1, filteredProperties.length)
    return {
      totalRevenue,
      occupancy,
      collection,
      avgRent,
    }
  }, [filteredProperties, totals.avgRent])

  const loadSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      const qs = new URLSearchParams({ period })
      if (propertyScope !== 'all') {
        const match = properties.find((p) => p.id === propertyScope || p.name === propertyScope)
        if (match?.id) {
          qs.set('propertyId', match.id)
        } else {
          qs.set('propertyId', propertyScope)
        }
      }
      const response = await fetch(`/api/manager/reports/summary?${qs.toString()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load reports.')
      }
      setTotals({
        revenue: payload.data?.totals?.revenue || 0,
        occupancyRate: payload.data?.totals?.occupancyRate || 0,
        collectionRate: payload.data?.totals?.collectionRate || 0,
        prevCollectionRate: payload.data?.totals?.prevCollectionRate || payload.data?.totals?.collectionRate || 0,
        avgRent: payload.data?.totals?.avgRent || 0,
      })
      const mapped =
        (payload.data?.properties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          location: p.location,
          revenue: p.revenue || 0,
          avg: p.avg || payload.data?.totals?.avgRent || 0,
          billed: p.billed || 0,
          occupancy: p.occupancy || 0,
          collectionRate: p.collectionRate || 0,
          units: p.units || 0,
        })) || []
      setProperties(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load data')
      toast({
        title: 'Unable to load reports',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [period, propertyScope])

  const exportRows = filteredProperties.map((p) => ({
    property: p.name,
    revenue: `KES ${p.revenue.toLocaleString()}`,
    expected: p.billed ? `KES ${p.billed.toLocaleString()}` : '—',
    avgUnit: `KES ${(p.avg || totals.avgRent).toLocaleString()}`,
    occupancy: `${(p.occupancy || 0).toFixed(1)}%`,
    collection: `${(p.collectionRate || 0).toFixed(1)}%`,
    performance: (() => {
      const expected = p.billed || p.revenue || 0
      if (!expected) return '0%'
      return `${Math.min(100, (p.revenue / expected) * 100).toFixed(1)}%`
    })(),
  }))

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `reports-${period}-${propertyScope}-${new Date().toISOString().slice(0, 10)}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = { documentTitle: 'Portfolio Performance', generatedAtISO }
    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Revenue', accessor: (row: any) => row.revenue },
      { header: 'Avg/Unit', accessor: (row: any) => row.avgUnit },
      { header: 'Occupancy', accessor: (row: any) => row.occupancy },
      { header: 'Collection', accessor: (row: any) => row.collection },
      { header: 'Performance %', accessor: (row: any) => row.performance },
    ]
    const summaryRows = [
      [
        'TOTALS',
        `KES ${totals.revenue.toLocaleString()}`,
        '',
        `KES ${Math.round(totals.avgRent).toLocaleString()}`,
        `${(totals.occupancyRate || 0).toFixed(1)}%`,
        `${(totals.collectionRate || 0).toFixed(1)}%`,
        '',
      ],
    ]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Portfolio Performance',
        subtitle: `Period: ${period}, Scope: ${propertyScope}. Performance % mirrors the bar graph (revenue vs expected).`,
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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="h-6 w-6 text-[#4682B4]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Financial Reports</h1>
                <p className="text-sm text-muted-foreground">Portfolio performance, trends, and exports.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Last 30 days</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="semi">6 months</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={propertyScope} onValueChange={setPropertyScope}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Property scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id || p.name} value={p.id || p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Eye className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('excel')}>
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv')}>
                    CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {loading && (
            <div className="space-y-4">
              <SkeletonLoader height={22} width="35%" />
              <SkeletonPropertyCard count={4} />
              <SkeletonTable rows={4} columns={4} />
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-4">
              <SkeletonLoader height={120} />
              <SkeletonLoader height={120} />
              <SkeletonLoader height={120} />
              <SkeletonLoader height={120} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-white shadow-lg border-0">
                <CardHeader className="pb-3">
                  <CardDescription>Total Revenue</CardDescription>
                  <CardTitle className="text-3xl text-green-700">
                    KES {Math.round(totals.revenue).toLocaleString()}
                  </CardTitle>
                  <div className="flex items-center text-xs text-green-600">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +8.2% vs prior period
                  </div>
                </CardHeader>
              </Card>
              <Card className="bg-white shadow-lg border-0">
                <CardHeader className="pb-3">
                  <CardDescription>Occupancy rate</CardDescription>
                  <CardTitle className="text-3xl text-blue-700">
                    {(summary.occupancy || totals.occupancyRate).toFixed(2)}%
                  </CardTitle>
                  <div className="flex items-center text-xs text-green-600">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Stable vs last period
                  </div>
                </CardHeader>
              </Card>
              <Card className="bg-white shadow-lg border-0">
                <CardHeader className="pb-3">
                  <CardDescription>Collection rate</CardDescription>
                  <CardTitle className="text-3xl text-blue-700">
                    {(summary.collection || totals.collectionRate).toFixed(2)}%
                  </CardTitle>
                  <div
                    className={`flex items-center text-xs ${
                      (summary.collection || totals.collectionRate) >= totals.prevCollectionRate
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {(summary.collection || totals.collectionRate) >= totals.prevCollectionRate ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(
                      (summary.collection || totals.collectionRate) - totals.prevCollectionRate
                    ).toFixed(2)}
                    % vs prev period
                  </div>
                </CardHeader>
              </Card>
              <Card className="bg-white shadow-lg border-0">
                <CardHeader className="pb-3">
                  <CardDescription>Avg. Rent / Unit</CardDescription>
                  <CardTitle className="text-3xl text-orange-600">
                    KES {Math.round(summary.avgRent || totals.avgRent).toLocaleString()}
                  </CardTitle>
                  <div className="flex items-center text-xs text-green-600">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    Healthy uplift
                  </div>
                </CardHeader>
              </Card>
            </div>
          )}

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Monthly Revenue Trend</CardTitle>
                <CardDescription>Period and scope applied across the dataset</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <SkeletonTable rows={3} columns={3} />
              ) : filteredProperties.length === 0 ? (
                <div className="text-sm text-muted-foreground">No report data for this scope.</div>
              ) : (
                <div className="space-y-3">
                  {filteredProperties.map((item) => {
                    const expected = item.billed || item.revenue || 1
                    const fill = expected === 0 ? 0 : Math.min(100, (item.revenue / expected) * 100)
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span className="font-bold">
                            {item.revenue.toLocaleString()} / {expected.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="h-3 rounded-full transition-all"
                            style={{
                              width: `${fill}%`,
                              background: 'linear-gradient(90deg,#10b981,#2563eb)',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Property Performance</CardTitle>
              <CardDescription>Occupancy and revenue by property</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <SkeletonPropertyCard count={3} />
              ) : filteredProperties.length === 0 ? (
                <div className="text-sm text-muted-foreground">No property performance data.</div>
              ) : (
                <div className="space-y-6">
                  {filteredProperties.map((property) => (
                    <div key={property.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{property.name}</h4>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span>Units: {property.units}</span>
                            <span>Revenue: KES {property.revenue.toLocaleString()}</span>
                            <span>Avg/Unit: KES {Number(property.avg || 0).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">{Number(property.occupancy || 0).toFixed(2)}% occupied</Badge>
                          <Badge variant="secondary">{Number(property.collectionRate || 0).toFixed(2)}% collected</Badge>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${property.occupancy}%`, background: '#10b981' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Generate Detailed Reports</CardTitle>
              <CardDescription>Create custom reports by period and property</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Link href="/dashboard/manager/reports/revenue">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6 text-center space-y-2">
                      <div className="text-4xl">📊</div>
                      <h4 className="font-medium">Revenue Report</h4>
                      <p className="text-xs text-muted-foreground">Trends and property breakdowns</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link href="/dashboard/manager/reports/occupancy">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6 text-center space-y-2">
                      <div className="text-4xl">👥</div>
                      <h4 className="font-medium">Occupancy Report</h4>
                      <p className="text-xs text-muted-foreground">Rates, move-ins, and trends</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link href="/dashboard/manager/reports/financial-statement">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6 text-center space-y-2">
                      <div className="text-4xl">📄</div>
                      <h4 className="font-medium">Financial Statement</h4>
                      <p className="text-xs text-muted-foreground">Income, expenses, and net</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link href="/dashboard/manager/reports/maintenance-performance">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6 text-center space-y-2">
                      <div className="text-4xl">🛠️</div>
                      <h4 className="font-medium">Maintenance Performance</h4>
                      <p className="text-xs text-muted-foreground">Spend vs rent collected per unit</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
