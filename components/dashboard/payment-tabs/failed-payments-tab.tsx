'use client'

import { useMemo, useState } from 'react'
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
import { FailureBreakdown, PaymentRecord } from '@/components/dashboard/payment-tabs/types'
import { SkeletonTable } from '@/components/ui/skeletons'
import { SkeletonTable } from '@/components/ui/skeletons'

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

interface FailedPaymentsTabProps {
  payments: PaymentRecord[]
  breakdown: FailureBreakdown[]
  loading: boolean
}

export function FailedPaymentsTab({ payments, breakdown, loading }: FailedPaymentsTabProps) {
  const [timeFilter, setTimeFilter] = useState('30')

  const filteredPayments = useMemo(() => {
    if (timeFilter === 'all') return payments
    const days = Number(timeFilter)
    if (!Number.isFinite(days)) return payments
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000
    return payments.filter((payment) => {
      if (!payment.lastStatusCheck) return true
      return new Date(payment.lastStatusCheck).getTime() >= threshold
    })
  }, [payments, timeFilter])

  const handleRetry = (paymentId: string) => {
    console.log('[payments] retry', paymentId)
  }

  const handleDefer = (paymentId: string) => {
    console.log('[payments] defer', paymentId)
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
        {(breakdown.length ? breakdown : [{ reason: 'No failures', count: 0, amount: 0 }]).map((item, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.reason}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-xs text-muted-foreground">
                {currencyFormatter.format(item.amount)}
              </p>
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6">
                  <SkeletonTable rows={4} columns={6} />
                </TableCell>
              </TableRow>
            ) : filteredPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No failed payments for this range.
                </TableCell>
              </TableRow>
            ) : (
              filteredPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.tenantName}</TableCell>
                  <TableCell>{currencyFormatter.format(payment.amount)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="destructive">
                        {(payment.mpesaResponseCode || payment.mpesaQueryStatus || 'error').toUpperCase()}
                      </Badge>
                      {(payment.mpesaQueryStatus || payment.notes) && (
                        <p className="text-xs text-muted-foreground">
                          {payment.mpesaQueryStatus || payment.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{payment.retryCount || 0}</TableCell>
                  <TableCell className="text-sm">
                    {payment.lastStatusCheck ? new Date(payment.lastStatusCheck).toLocaleString() : '—'}
                  </TableCell>
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
              ))
            )}
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
