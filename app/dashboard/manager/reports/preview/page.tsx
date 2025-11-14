'use client'

import { ArrowLeft, Download, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function ReportPreviewPage() {
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

        {/* Report Preview */}
        <Card className="bg-white">
          <CardContent className="p-8 md:p-12">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b">
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
                <p className="text-sm text-muted-foreground">#FR-2024-12</p>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-1 bg-orange-100 rounded text-xs font-medium text-orange-700">
                  ⭐ Premium Report
                </div>
              </div>
            </div>

            {/* Report Details */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Report Date</p>
                <p className="font-semibold">December 31, 2024</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Period</p>
                <p className="font-semibold">July - December 2024</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Report Type</p>
                <p className="font-semibold">Portfolio Financial Summary</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Properties</p>
                <p className="font-semibold">3</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-blue-50 p-6 rounded-lg mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">⭐</span>
                <h3 className="font-semibold">Financial Summary</h3>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">KES 2,350,000</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">KES 705,000</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Net Income</p>
                  <p className="text-2xl font-bold text-blue-600">KES 1,645,000</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mt-4">
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Occupancy Rate</p>
                  <p className="text-xl font-bold">89.2%</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Collection Rate</p>
                  <p className="text-xl font-bold">94.5%</p>
                </div>
              </div>
            </div>

            {/* Monthly Performance */}
            <div className="mb-8">
              <h3 className="font-semibold mb-4">Monthly Performance</h3>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { month: 'Jul', revenue: 200, expenses: 65 },
                  { month: 'Aug', revenue: 210, expenses: 68 },
                  { month: 'Sep', revenue: 220, expenses: 70 },
                  { month: 'Oct', revenue: 225, expenses: 72 },
                  { month: 'Nov', revenue: 235, expenses: 75 },
                  { month: 'Dec', revenue: 235, expenses: 75 }
                ].map((data) => (
                  <div key={data.month} className="text-center">
                    <div className="flex flex-col items-center gap-1 mb-2">
                      <div className="w-full bg-gray-200 rounded h-24 flex items-end overflow-hidden">
                        <div 
                          className="w-1/2 bg-green-500" 
                          style={{ height: `${data.revenue / 2.5}%` }}
                        />
                        <div 
                          className="w-1/2 bg-red-500" 
                          style={{ height: `${data.expenses / 2.5}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs font-medium">{data.month}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>Expenses</span>
                </div>
              </div>
            </div>

            {/* Properties Performance */}
            <div className="mb-8">
              <h3 className="font-semibold mb-4">Properties Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="text-left p-3 font-semibold text-sm">Property</th>
                      <th className="text-right p-3 font-semibold text-sm">Revenue</th>
                      <th className="text-right p-3 font-semibold text-sm">Expenses</th>
                      <th className="text-right p-3 font-semibold text-sm">Net Income</th>
                      <th className="text-right p-3 font-semibold text-sm">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Kilimani Heights', revenue: 1080000, expenses: 324000, net: 756000, occupancy: 92 },
                      { name: 'Westlands Plaza', revenue: 864000, expenses: 259200, net: 604800, occupancy: 89 },
                      { name: 'Karen Villas', revenue: 420000, expenses: 126000, net: 294000, occupancy: 88 }
                    ].map((property) => (
                      <tr key={property.name} className="border-b">
                        <td className="p-3 font-medium">{property.name}</td>
                        <td className="p-3 text-right text-green-600">KES {property.revenue.toLocaleString()}</td>
                        <td className="p-3 text-right text-red-600">KES {property.expenses.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold">KES {property.net.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-600" 
                                style={{ width: `${property.occupancy}%` }}
                              />
                            </div>
                            <span className="text-sm">{property.occupancy}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t text-center text-sm text-muted-foreground">
              <p className="mb-1">This premium report was generated on December 31, 2024</p>
              <p className="mb-4">
                RentalKenya Ltd. | P.O. Box 12345-00100, Nairobi | www.rentalkenya.com
              </p>
              <p className="text-xs text-orange-600 font-medium">Premium Property Management Solutions</p>
              <p className="text-xs mt-2">Page 1 of 2</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
