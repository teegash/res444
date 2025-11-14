'use client'

import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export default function PaymentHistoryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Payment History</h1>
          </div>
          <Button className="ml-auto" variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download Statement
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Paid (Last 5 months)</CardDescription>
              <CardTitle className="text-3xl text-green-600">KES 225,000</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>On-time Payment Rate</CardDescription>
              <CardTitle className="text-3xl text-blue-600">100%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Average Monthly Payment</CardDescription>
              <CardTitle className="text-3xl text-purple-600">KES 45,000</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Upcoming Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Your next rent payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="font-semibold">January 2025</p>
                <p className="text-sm text-muted-foreground">Due: Jan 1, 2025</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-2xl font-bold">KES 45,000</p>
                  <Badge variant="outline">Due</Badge>
                </div>
                <Link href="/dashboard/tenant/payment">
                  <Button>Pay Now</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Statements */}
        <Card>
          <CardHeader>
            <CardTitle>Account Statements</CardTitle>
            <CardDescription>Your financial statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { period: 'July - December 2024', date: 'Dec 31, 2024', id: 'STMT-JK-2024-H2' },
              { period: 'January - June 2024', date: 'Jun 30, 2024', id: 'STMT-JK-2024-H1' },
              { period: 'July - December 2023', date: 'Dec 31, 2023', id: 'STMT-JK-2023-H2' }
            ].map((statement) => (
              <div key={statement.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Statement: {statement.period}</p>
                    <p className="text-sm text-muted-foreground">Generated on {statement.date}</p>
                  </div>
                </div>
                <Link href={`/dashboard/tenant/statements/${statement.id}`}>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    View Statement
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Input placeholder="Search by month..." />
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>All your rent payment records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { month: 'December 2024', amount: 45000, ref: 'QK12345678', date: 'Dec 1, 2024', method: 'M-Pesa' },
              { month: 'November 2024', amount: 45000, ref: 'QK12345677', date: 'Nov 1, 2024', method: 'M-Pesa' },
              { month: 'October 2024', amount: 45000, ref: 'BT98765432', date: 'Oct 1, 2024', method: 'Bank Transfer' },
              { month: 'September 2024', amount: 45000, ref: 'QK12345675', date: 'Sep 1, 2024', method: 'M-Pesa' },
              { month: 'August 2024', amount: 45000, ref: 'QK12345674', date: 'Aug 1, 2024', method: 'M-Pesa' }
            ].map((payment, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-green-100 rounded">
                    <FileText className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">{payment.month}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.method} • Ref: {payment.ref}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold">KES {payment.amount.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{payment.date}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700">Paid</Badge>
                  <Link href={`/dashboard/tenant/receipts/REC-${payment.ref}`}>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      View Receipt
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
