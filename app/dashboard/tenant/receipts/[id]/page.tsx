'use client'

import { ArrowLeft, Download, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function TenantReceiptPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/tenant/payments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Payment Receipt</h1>
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

        {/* Receipt Preview */}
        <Card>
          <CardContent className="p-8 md:p-12">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <span className="text-2xl">🏢</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-green-600">RentalKenya</h2>
                  <p className="text-sm text-muted-foreground">Property Management</p>
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold">RECEIPT</h3>
                <p className="text-sm text-muted-foreground">#{params.id}</p>
              </div>
            </div>

            {/* Receipt Details */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Date</p>
                <p className="font-semibold">Dec 1, 2024</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
                <p className="font-semibold">M-Pesa</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Received From</p>
                <p className="font-semibold">John Kamau</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Reference</p>
                <p className="font-semibold">QK12345678</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">Kilimani Heights - Unit A-101</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Period</p>
                <p className="font-semibold">December 2024</p>
              </div>
            </div>

            {/* Payment Details Table */}
            <div className="mb-8">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Description</th>
                    <th className="text-right p-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-3">Rent payment for December 2024</td>
                    <td className="p-3 text-right font-semibold">KES 45,000</td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="p-3 font-bold">Total</td>
                    <td className="p-3 text-right text-xl font-bold text-green-600">KES 45,000</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Thank You Message */}
            <div className="bg-green-50 p-6 rounded-lg text-center mb-8">
              <p className="text-lg font-semibold text-green-900 mb-2">Thank you for your payment!</p>
              <p className="text-sm text-green-700">
                For any inquiries, please contact us at support@rentalkenya.com or call +254 712 345 678
              </p>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t text-center text-sm text-muted-foreground">
              <p>RentalKenya Ltd. | P.O. Box 12345-00100, Nairobi | www.rentalkenya.com</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
