'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Printer, Share2, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

type Summary = {
  revenue: number
  occupancyRate: number
  collectionRate: number
  prevCollectionRate: number
  avgRent: number
  properties: Array<{
    name: string
    location: string | null
    revenue: number
    billed: number
    occupancy: number
    collectionRate: number
  }>
}

export default function ReportPreviewPage() {
  const [period, setPeriod] = useState('quarter')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(
    () => ({
      revenue: summary?.revenue || 0,
      expenses: 0,
      net: summary ? summary.revenue - 0 : 0,
    }),
    [summary]
  )

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/manager/reports/summary?period=${period}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load report.')
      }
      setSummary({
        revenue: payload.data?.totals?.revenue || 0,
        occupancyRate: payload.data?.totals?.occupancyRate || 0,
        collectionRate: payload.data?.totals?.collectionRate || 0,
        prevCollectionRate: payload.data?.totals?.prevCollectionRate || 0,
        avgRent: payload.data?.totals?.avgRent || 0,
        properties: payload.data?.properties || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [period])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/manager/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Reports
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Premium Financial Report Preview</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="semi">6 months</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-white shadow-lg border-0">
          <CardContent className="p-8 md:p-12 space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between pb-6 border-b">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <span className="text-2xl">🏢</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-blue-600">RentalKenya</h2>
                  <p className="text-sm text-orange-600 font-medium">Premium Property Management</p>
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold">FINANCIAL REPORT</h3>
                <p className="text-sm text-muted-foreground">#{new Date().getFullYear()}</p>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-1 bg-orange-100 rounded text-xs font-medium text-orange-700">
                  ⭐ Premium Report
                </div>
              </div>
            </div>

            {/* Report Details */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Report Date</p>
                <p className="font-semibold">{new Date().toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Period</p>
                <p className="font-semibold capitalize">{period}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Report Type</p>
                <p className="font-semibold">Portfolio Financial Summary</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Properties</p>
                <p className="font-semibold">{summary?.properties?.length || 0}</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-white p-6 rounded-xl border">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">⭐</span>
                <h3 className="font-semibold">Financial Summary</h3>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    KES {totals.revenue.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">KES 0</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-muted-foreground mb-1">Net Income</p>
                  <p className="text-2xl font-bold text-blue-600">KES {totals.net.toLocaleString()}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mt-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-muted-foreground mb-1">Occupancy Rate</p>
                  <p className="text-xl font-bold">
                    {(summary?.occupancyRate || 0).toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-muted-foreground mb-1">Collection Rate</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold">
                      {(summary?.collectionRate || 0).toFixed(2)}%
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        (summary?.collectionRate || 0) >= (summary?.prevCollectionRate || 0)
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {(summary?.collectionRate || 0) >= (summary?.prevCollectionRate || 0) ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(
                        (summary?.collectionRate || 0) - (summary?.prevCollectionRate || 0)
                      ).toFixed(2)}
                      %
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Properties Performance */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Properties Performance</h3>
                <Badge variant="outline" className="text-xs">
                  {summary?.properties?.length || 0} properties
                </Badge>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="text-left p-3 font-semibold text-sm">Property</th>
                      <th className="text-right p-3 font-semibold text-sm">Revenue</th>
                      <th className="text-right p-3 font-semibold text-sm">Expected</th>
                      <th className="text-right p-3 font-semibold text-sm">Net (no expenses)</th>
                      <th className="text-right p-3 font-semibold text-sm">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.properties || []).map((property) => {
                      const revenue = property.revenue || 0
                      const expected = property.billed || revenue
                      const fill = expected === 0 ? 0 : Math.min(100, (revenue / expected) * 100)
                      return (
                        <tr key={property.name} className="border-b">
                          <td className="p-3 font-medium">{property.name}</td>
                          <td className="p-3 text-right text-green-600">KES {revenue.toLocaleString()}</td>
                          <td className="p-3 text-right text-muted-foreground">KES {expected.toLocaleString()}</td>
                          <td className="p-3 text-right font-semibold">KES {revenue.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-600"
                                  style={{ width: `${(property.occupancy || 0).toFixed(2)}%` }}
                                />
                              </div>
                              <span className="text-sm">{(property.occupancy || 0).toFixed(2)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t text-center text-sm text-muted-foreground">
              <p className="mb-1">This premium report was generated on {new Date().toLocaleDateString()}</p>
              <p className="mb-4">
                RentalKenya Ltd. | P.O. Box 12345-00100, Nairobi | www.rentalkenya.com
              </p>
              <p className="text-xs text-orange-600 font-medium">Premium Property Management Solutions</p>
              <p className="text-xs mt-2">Preview • Not for distribution</p>
            </div>

            {error ? <p className="text-sm text-red-600">Failed to load data: {error}</p> : null}
            {loading ? <p className="text-sm text-muted-foreground">Loading data…</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
