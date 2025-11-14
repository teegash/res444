'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const payments = [
  { id: 1, tenant: 'John Doe', amount: 'KES 18,500', date: '2024-02-01', status: 'Paid', method: 'M-Pesa' },
  { id: 2, tenant: 'Jane Smith', amount: 'KES 22,000', date: '2024-02-01', status: 'Paid', method: 'M-Pesa' },
  { id: 3, tenant: 'Mike Johnson', amount: 'KES 15,000', date: '2024-02-03', status: 'Pending', method: 'M-Pesa' },
]

export function ManagerPaymentsList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Activity</CardTitle>
        <CardDescription>Recent payments from your tenants</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2">Tenant</th>
                <th className="text-left py-3 px-2">Amount</th>
                <th className="text-left py-3 px-2">Date</th>
                <th className="text-left py-3 px-2">Method</th>
                <th className="text-left py-3 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b">
                  <td className="py-3 px-2">{payment.tenant}</td>
                  <td className="py-3 px-2 font-semibold">{payment.amount}</td>
                  <td className="py-3 px-2">{payment.date}</td>
                  <td className="py-3 px-2">{payment.method}</td>
                  <td className="py-3 px-2">
                    <Badge variant={payment.status === 'Paid' ? 'default' : 'secondary'}>
                      {payment.status}
                    </Badge>
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
