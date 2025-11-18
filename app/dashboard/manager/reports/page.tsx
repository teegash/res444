'use client'

import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { TrendingUp, TrendingDown, BarChart3, Eye } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="h-6 w-6 text-[#4682B4]" />
              </div>
              <h1 className="text-3xl font-bold">Financial Reports</h1>
            </div>
            <div className="flex gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Link href="/dashboard/manager/reports/preview">
                <Button>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Report
                </Button>
              </Link>
            </div>
          </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="text-3xl text-green-600">KES 2,350,000</CardTitle>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                +8.2% from last month
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Occupancy Rate</CardDescription>
              <CardTitle className="text-3xl text-blue-600">89.2%</CardTitle>
              <div className="flex items-center text-xs text-red-600">
                <TrendingDown className="h-3 w-3 mr-1" />
                -2.1% from last month
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Collection Rate</CardDescription>
              <CardTitle className="text-3xl text-purple-600">94.5%</CardTitle>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                +1.3% from last month
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg. Rent/Unit</CardDescription>
              <CardTitle className="text-3xl text-orange-600">KES 42,500</CardTitle>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                +5.2% from last month
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Monthly Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue Trend</CardTitle>
            <CardDescription>Revenue over the last 5 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { month: 'Aug 2024', revenue: 2100000, width: '85%' },
                { month: 'Sep 2024', revenue: 2300000, width: '93%' },
                { month: 'Oct 2024', revenue: 2200000, width: '89%' },
                { month: 'Nov 2024', revenue: 2400000, width: '97%' },
                { month: 'Dec 2024', revenue: 2400000, width: '97%' }
              ].map((item) => (
                <div key={item.month} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.month}</span>
                    <span className="font-bold">KES {(item.revenue / 1000000).toFixed(1)}M</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Property Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Property Performance</CardTitle>
            <CardDescription>Occupancy and revenue by property</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { name: 'Kilimani Heights', units: '22/24', revenue: 1080000, avg: 49000, occupancy: 92 },
                { name: 'Westlands Plaza', units: '16/18', revenue: 864000, avg: 54000, occupancy: 89 },
                { name: 'Karen Villas', units: '7/8', revenue: 420000, avg: 60000, occupancy: 88 },
                { name: 'Eastlands Court', units: '28/32', revenue: 672000, avg: 24000, occupancy: 88 }
              ].map((property) => (
                <div key={property.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{property.name}</h4>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Units: {property.units}</span>
                        <span>Revenue: KES {property.revenue.toLocaleString()}</span>
                        <span>Avg/Unit: KES {property.avg.toLocaleString()}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{property.occupancy}% occupied</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${property.occupancy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Generate Detailed Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Detailed Reports</CardTitle>
            <CardDescription>Create custom reports for specific time periods and properties</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: 'Revenue Report', icon: '📊' },
                { title: 'Occupancy Report', icon: '👥' },
                { title: 'Financial Statement', icon: '📄' }
              ].map((report) => (
                <Card key={report.title} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl mb-2">{report.icon}</div>
                    <h4 className="font-medium mb-1">{report.title}</h4>
                    <Button variant="outline" size="sm" className="mt-3">
                      Generate
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</div>
  )
}
