'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'

const paymentHistory = [
  { id: 1, date: '2024-01-05', amount: 18500, method: 'M-Pesa', ref: 'TXN123456', status: 'Completed' },
  { id: 2, date: '2023-12-01', amount: 18500, method: 'M-Pesa', ref: 'TXN123455', status: 'Completed' },
  { id: 3, date: '2023-11-03', amount: 18500, method: 'Bank Transfer', ref: 'BANK001234', status: 'Completed' },
  { id: 4, date: '2023-10-01', amount: 18500, method: 'M-Pesa', ref: 'TXN123454', status: 'Completed' },
]

export function PaymentHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment History</CardTitle>
        <CardDescription>Your previous payments</CardDescription>
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
                    <Badge variant="default">{payment.status}</Badge>
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
  )
}
