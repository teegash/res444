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

type PropertyMetric = {
  name: string
  units: string
  revenue: number
  avg: number
  occupancy: number
  collectionRate: number
}

const propertyMetrics: PropertyMetric[] = [
  { name: 'Kilimani Heights', units: '22/24', revenue: 1080000, avg: 49000, occupancy: 92, collectionRate: 95 },
  { name: 'Westlands Plaza', units: '16/18', revenue: 864000, avg: 54000, occupancy: 89, collectionRate: 93 },
  { name: 'Karen Villas', units: '7/8', revenue: 420000, avg: 60000, occupancy: 88, collectionRate: 90 },
  { name: 'Eastlands Court', units: '28/32', revenue: 672000, avg: 24000, occupancy: 88, collectionRate: 91 },
]

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
      <CardContent className="p-4 flex flex-col items-center gap-2">
        <div
          className="relative w-28 h-28 rounded-full flex items-center justify-center"
          style={{
            background: `conic-gradient(${color} ${percent * 3.6}deg, #e5e7eb ${percent * 3.6}deg 360deg)`,
          }}
        >
          <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color }}>
                {value.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('quarter')
  const [propertyScope, setPropertyScope] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<typeof propertyMetrics>(propertyMetrics)
  const [totals, setTotals] = useState({
    revenue: 0,
    occupancyRate: 0,
    collectionRate: 0,
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
      const response = await fetch(`/api/manager/reports/summary?period=${period}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load reports.')
      }
      setTotals({
        revenue: payload.data?.totals?.revenue || 0,
        occupancyRate: payload.data?.totals?.occupancyRate || 0,
        collectionRate: payload.data?.totals?.collectionRate || 0,
        avgRent: payload.data?.totals?.avgRent || 0,
      })
      const mapped =
        (payload.data?.properties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          location: p.location,
          revenue: p.revenue || 0,
          avg: totals.avgRent || 0,
          occupancy: p.occupancy || 0,
          collectionRate: p.collectionRate || 0,
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
  }, [period])

  const exportRows = filteredProperties.map((p) => ({
    property: p.name,
    revenue: `KES ${p.revenue.toLocaleString()}`,
    avgUnit: `KES ${p.avg.toLocaleString()}`,
    occupancy: `${p.occupancy}%`,
    collection: `${p.collectionRate}%`,
  }))

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `reports-${period}-${propertyScope}-${new Date().toISOString().slice(0, 10)}`
    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Revenue', accessor: (row: any) => row.revenue },
      { header: 'Avg/Unit', accessor: (row: any) => row.avgUnit },
      { header: 'Occupancy', accessor: (row: any) => row.occupancy },
      { header: 'Collection', accessor: (row: any) => row.collection },
    ]
    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Portfolio Performance',
        subtitle: `Period: ${period}, Scope: ${propertyScope}`,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, exportRows)
    } else {
      exportRowsAsCSV(filename, columns, exportRows)
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
                  {propertyMetrics.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link href="/dashboard/manager/reports/preview">
                <Button variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview PDF
                </Button>
              </Link>
            </div>
          </div>

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
            <GaugeCard
              title="Occupancy rate"
              value={summary.occupancy || totals.occupancyRate}
              subtitle="Portfolio avg."
            />
            <GaugeCard
              title="Collection rate"
              value={summary.collection || totals.collectionRate}
              subtitle="Rent collected"
              color="#2563eb"
            />
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
              <div className="space-y-3">
                {filteredProperties.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="font-bold">KES {(item.revenue / 1000000).toFixed(2)}M</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, item.revenue / 2500000 * 100)}%`,
                          background: 'linear-gradient(90deg,#10b981,#2563eb)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Property Performance</CardTitle>
              <CardDescription>Occupancy and revenue by property</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {filteredProperties.map((property) => (
                  <div key={property.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">{property.name}</h4>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>Units: {property.units}</span>
                          <span>Revenue: KES {property.revenue.toLocaleString()}</span>
                          <span>Avg/Unit: KES {property.avg.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{property.occupancy}% occupied</Badge>
                        <Badge variant="secondary">{property.collectionRate}% collected</Badge>
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
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
