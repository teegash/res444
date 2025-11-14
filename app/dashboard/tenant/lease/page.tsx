'use client'

import { ArrowLeft, Download, FileText, Calendar, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function LeasePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/30 via-white to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold">Lease Agreement</h1>
          </div>
          <Button className="ml-auto" variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download Lease
          </Button>
        </div>

        {/* Lease Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Lease Overview</CardTitle>
            <CardDescription>Your current lease agreement details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">Kilimani Heights</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Unit</p>
                <p className="font-semibold">A-101</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant</p>
                <p className="font-semibold">John Kamau</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Lease Period</p>
                <p className="font-semibold">January 1, 2024 - December 31, 2025</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Monthly Rent</p>
                <p className="font-semibold text-green-600">KES 45,000</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <Badge className="bg-green-100 text-green-700">Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Important Dates */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <CardTitle>Important Dates</CardTitle>
              </div>
              <CardDescription>Key dates for your lease</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium">Next rent payment due</p>
                  <p className="text-sm text-muted-foreground">January 1, 2025</p>
                </div>
                <Badge>payment</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div>
                  <p className="font-medium">Lease renewal decision deadline</p>
                  <p className="text-sm text-muted-foreground">December 1, 2025</p>
                </div>
                <Badge variant="outline" className="border-orange-500 text-orange-700">renewal</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div>
                  <p className="font-medium">Current lease expires</p>
                  <p className="text-sm text-muted-foreground">December 31, 2025</p>
                </div>
                <Badge variant="outline" className="border-purple-500 text-purple-700">expiry</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Key Lease Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Key Lease Terms</CardTitle>
              <CardDescription>Important terms and conditions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-medium text-sm">Monthly Rent</p>
                <p className="text-muted-foreground text-sm">KES 45,000 due on the 1st of each month</p>
              </div>
              <div>
                <p className="font-medium text-sm">Security Deposit</p>
                <p className="text-muted-foreground text-sm">KES 90,000 (refundable at lease end)</p>
              </div>
              <div>
                <p className="font-medium text-sm">Utilities</p>
                <p className="text-muted-foreground text-sm">Tenant responsible for electricity and water</p>
              </div>
              <div>
                <p className="font-medium text-sm">Maintenance</p>
                <p className="text-muted-foreground text-sm">Landlord responsible for major repairs</p>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4">
                View All Terms
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Lease Renewal */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <CardTitle>Lease Renewal</CardTitle>
            </div>
            <CardDescription>Information about renewing your lease</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-4">
              <p className="text-sm font-medium text-orange-900">Renewal Available</p>
              <p className="text-sm text-orange-700 mt-1">
                Your lease expires on December 31, 2025. You can start the renewal process 60 days before expiration.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Renewal Option</p>
                <p className="font-semibold">Available</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Notice Period Required</p>
                <p className="font-semibold">30 days</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button>Express Interest in Renewal</Button>
              <Button variant="outline">Contact Property Manager</Button>
            </div>
          </CardContent>
        </Card>

        {/* Lease Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Lease Documents</CardTitle>
            <CardDescription>Download your lease-related documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { name: 'Original Lease Agreement', date: 'Signed January 1, 2024' },
                { name: 'Security Deposit Receipt', date: 'KES 90,000 paid' },
                { name: 'Property Inspection Report', date: 'Move-in condition' },
                { name: 'Tenant Handbook', date: 'Rules and guidelines' }
              ].map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.date}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
