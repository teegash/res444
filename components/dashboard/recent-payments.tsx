import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const payments = [
  {
    tenant: 'John Doe',
    amount: 'KES 10,000',
    status: 'Paid',
    date: '2024-02-15',
  },
  {
    tenant: 'Jane Smith',
    amount: 'KES 25,000',
    status: 'Paid',
    date: '2024-02-14',
  },
  {
    tenant: 'Bob Wilson',
    amount: 'KES 10,000',
    status: 'Overdue',
    date: '2024-02-01',
  },
  {
    tenant: 'Mary Johnson',
    amount: 'KES 15,000',
    status: 'Pending',
    date: '2024-02-10',
  },
  {
    tenant: 'Tom Lee',
    amount: 'KES 10,000',
    status: 'Paid',
    date: '2024-02-13',
  },
]

export function RecentPayments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {payments.map((payment, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted"
            >
              <div>
                <p className="font-medium">{payment.tenant}</p>
                <p className="text-sm text-muted-foreground">{payment.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{payment.amount}</span>
                <Badge
                  variant={
                    payment.status === 'Paid'
                      ? 'default'
                      : payment.status === 'Overdue'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {payment.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
