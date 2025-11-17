'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileDown, CreditCard, CheckCircle, Calendar } from 'lucide-react'

const invoices = [
  { id: 'INV-2024-02', month: 'February 2024', amount: 18500, dueDate: '2024-02-01', paid: false, type: 'Rent' },
  { id: 'INV-2024-01', month: 'January 2024', amount: 18500, dueDate: '2024-01-01', paid: true, type: 'Rent' },
  { id: 'INV-2023-12', month: 'December 2023', amount: 18500, dueDate: '2023-12-01', paid: true, type: 'Rent' },
]

const paymentHistory = [
  { id: 1, date: '2024-01-05', amount: 18500, method: 'M-Pesa', status: 'Completed', ref: 'TXN123456' },
  { id: 2, date: '2023-12-01', amount: 18500, method: 'M-Pesa', status: 'Completed', ref: 'TXN123455' },
]

export function PaymentsAndInvoicesTab() {
  return (
    <div className="space-y-6 mt-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Payment Status</p>
                <p className="text-xl font-bold text-green-700">December 2024 - Paid</p>
              </div>
            </div>
            <p className="text-sm text-green-700">Paid on Dec 1, 2024</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Next Payment Due</p>
                <p className="text-xl font-bold text-blue-700">Jan 1, 2025</p>
              </div>
            </div>
            <p className="text-sm text-blue-700">KES 45,000</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Invoices</CardTitle>
          <CardDescription>Your invoices for the next months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-semibold">{invoice.month}</h4>
                    <Badge variant="outline">{invoice.type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Due: {invoice.dueDate}</p>
                </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-lg font-bold text-primary">KES {invoice.amount.toLocaleString()}</p>
                      <Badge variant={invoice.paid ? 'default' : 'secondary'} className={invoice.paid ? 'bg-green-600' : ''}>
                        {invoice.paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </div>
                  { !invoice.paid && (
                    <Button size="sm" className="bg-primary hover:bg-primary/90 gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pay Now
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Your past payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Date</th>
                  <th className="text-left py-3 px-2">Amount</th>
                  <th className="text-left py-3 px-2">Method</th>
                  <th className="text-left py-3 px-2">Reference</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr key={payment.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">{payment.date}</td>
                    <td className="py-3 px-2 font-semibold">KES {payment.amount.toLocaleString()}</td>
                    <td className="py-3 px-2">{payment.method}</td>
                    <td className="py-3 px-2 font-mono text-xs">{payment.ref}</td>
                    <td className="py-3 px-2">
                      <Badge className="bg-green-600">{payment.status}</Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
