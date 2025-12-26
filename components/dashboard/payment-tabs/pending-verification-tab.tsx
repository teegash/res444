'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PaymentRecord } from '@/components/dashboard/payment-tabs/types'
import { SkeletonTable } from '@/components/ui/skeletons'
import { useRouter } from 'next/navigation'

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

type PendingVerificationTabProps = {
  payments: PaymentRecord[]
  loading: boolean
  lastChecked: string | null
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

function resolveStatus(payment: PaymentRecord) {
  if (payment.paymentMethod === 'mpesa') {
    const status = (payment.mpesaQueryStatus || 'pending').toLowerCase()
    if (['checking', 'pending', 'processing', 'queued'].includes(status)) {
      return { label: 'Auto-checking', variant: 'auto' as const }
    }
    if (['failed', 'error', 'timeout', 'cancelled'].includes(status)) {
      return { label: 'Attention', variant: 'danger' as const }
    }
    return { label: status || 'Pending', variant: 'secondary' as const }
  }

  if (payment.paymentMethod === 'bank_transfer') {
    return { label: payment.depositSlipUrl ? 'Awaiting Review' : 'Awaiting Slip', variant: 'secondary' as const }
  }

  return { label: 'Pending', variant: 'outline' as const }
}

export function PendingVerificationTab({
  payments,
  loading,
  lastChecked,
}: PendingVerificationTabProps) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            <div>
              <p className="font-semibold">Auto-checking M-Pesa payments every 5 minutes</p>
              <p className="text-sm text-muted-foreground">
                Last checked: {lastChecked ? formatDate(lastChecked) : 'Sync scheduled'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant Name</TableHead>
              <TableHead>Amount (KES)</TableHead>
              <TableHead>Months</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6">
                  <SkeletonTable rows={4} columns={6} />
                </TableCell>
              </TableRow>
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  No pending payments right now.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => {
                const status = resolveStatus(payment)
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.tenantName}</TableCell>
                    <TableCell>{currencyFormatter.format(payment.amount)}</TableCell>
                    <TableCell>{payment.monthsPaid || 1}</TableCell>
                    <TableCell>{payment.invoiceType || '—'}</TableCell>
                    <TableCell className="capitalize">{payment.paymentMethod || '—'}</TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>
                      {status.variant === 'auto' ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="gap-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-spin" />
                                {status.label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {payment.mpesaReceiptNumber && <p>Receipt: {payment.mpesaReceiptNumber}</p>}
                              {payment.tenantPhone && <p>Phone: {payment.tenantPhone}</p>}
                              {payment.lastStatusCheck && (
                                <p>Checked: {formatDate(payment.lastStatusCheck)}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : status.variant === 'danger' ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      ) : (
                        <Badge variant={status.variant}>{status.label}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {payment.paymentMethod === 'mpesa' && (
                        <Button variant="ghost" size="sm">
                          Recheck
                        </Button>
                      )}
                      {payment.paymentMethod === 'bank_transfer' && payment.depositSlipUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push('/dashboard/payments?tab=deposits')}
                          className="gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          Review Slip
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
