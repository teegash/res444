'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle, RotateCcw, Clock } from 'lucide-react'

const failureBreakdown = [
  { reason: 'Insufficient Funds', count: 3, amount: 30000 },
  { reason: 'User Cancelled', count: 2, amount: 20000 },
  { reason: 'Invalid Phone', count: 1, amount: 10000 },
  { reason: 'Timeout', count: 2, amount: 15000 },
]

const failedPayments = [
  {
    id: 1,
    tenant: 'Bob Wilson',
    amount: 10000,
    error: 'InsufficientFunds',
    attempts: 2,
    lastAttempt: '2024-02-01 14:30',
  },
  {
    id: 2,
    tenant: 'Alice Brown',
    amount: 8000,
    error: 'UserCancelTransaction',
    attempts: 1,
    lastAttempt: '2024-02-01 13:15',
  },
]

export function FailedPaymentsTab() {
  const [timeFilter, setTimeFilter] = useState('30')

  const handleRetry = (paymentId: number) => {
    console.log('[v0] Retrying payment:', paymentId)
  }

  const handleDefer = (paymentId: number) => {
    console.log('[v0] Deferring payment:', paymentId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Past 30 Days</SelectItem>
            <SelectItem value="60">Past 60 Days</SelectItem>
            <SelectItem value="90">Past 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Failure Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {failureBreakdown.map((item, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.reason}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-xs text-muted-foreground">KES {item.amount.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Failed Payments Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Error Reason</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Last Attempt</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failedPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.tenant}</TableCell>
                <TableCell>KES {payment.amount.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="destructive">{payment.error}</Badge>
                </TableCell>
                <TableCell>{payment.attempts}</TableCell>
                <TableCell className="text-sm">{payment.lastAttempt}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleRetry(payment.id)}
                      className="gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDefer(payment.id)}
                      className="gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      Defer
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Error Explanations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common Errors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-semibold">InsufficientFunds:</span> M-Pesa account has low balance
          </p>
          <p>
            <span className="font-semibold">UserCancelTransaction:</span> Tenant cancelled, can retry anytime
          </p>
          <p>
            <span className="font-semibold">InvalidPhoneNumber:</span> Phone doesn't match M-Pesa account
          </p>
          <p>
            <span className="font-semibold">TransactionExpired:</span> STK prompt timed out, need new attempt
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
