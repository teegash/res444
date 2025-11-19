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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Eye, FileDown } from 'lucide-react'
import { PaymentRecord, PaymentStats } from '@/components/dashboard/payment-tabs/types'

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

interface VerifiedPaymentsTabProps {
  payments: PaymentRecord[]
  stats?: PaymentStats
  loading: boolean
}

export function VerifiedPaymentsTab({ payments, stats, loading }: VerifiedPaymentsTabProps) {
  const [timeFilter, setTimeFilter] = useState('30')
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  const filteredPayments = useMemo(() => {
    if (timeFilter === 'all') return payments
    const days = Number(timeFilter)
    if (!Number.isFinite(days)) return payments
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000
    return payments.filter((payment) => {
      if (!payment.verifiedAt) return true
      return new Date(payment.verifiedAt).getTime() >= threshold
    })
  }, [payments, timeFilter])

  const cards = {
    auto: {
      count: stats?.autoVerifiedCount || 0,
      amount: stats?.autoVerifiedAmount || 0,
      title: 'M-Pesa Auto-Verified',
      color: 'text-green-600',
    },
    manager: {
      count: stats?.managerVerifiedCount || 0,
      amount: stats?.managerVerifiedAmount || 0,
      title: 'Manager Verified',
      color: 'text-blue-600',
    },
    total: {
      count: stats?.verifiedCount || 0,
      amount: stats?.verifiedAmount || 0,
      title: 'Total Verified',
      color: 'text-foreground',
    },
  }

  const handleViewReceipt = (payment: PaymentRecord) => {
    setSelectedPayment(payment)
    setShowReceiptModal(true)
  }

  const handleDownloadReceipt = (payment: PaymentRecord) => {
    console.log('[payments] download receipt', payment.mpesaReceiptNumber)
  }

  const handleExportAll = (format: 'csv' | 'pdf') => {
    console.log('[payments] export verified', format)
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

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.values(cards).map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
              <p className="text-xs text-muted-foreground">
                {currencyFormatter.format(card.amount)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Verified Payments Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Verified By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Loading verified payments...
                </TableCell>
              </TableRow>
            ) : filteredPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No verified payments for this range.
                </TableCell>
              </TableRow>
            ) : (
              filteredPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.tenantName}</TableCell>
                  <TableCell>{currencyFormatter.format(payment.amount)}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600 capitalize">
                      {payment.paymentMethod || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{payment.verifiedBy || (payment.mpesaAutoVerified ? 'M-Pesa API' : '—')}</Badge>
                  </TableCell>
                  <TableCell>{payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {payment.mpesaReceiptNumber || payment.bankReferenceNumber || '—'}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewReceipt(payment)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadReceipt(payment)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => handleExportAll('csv')}
          className="gap-2"
        >
          <FileDown className="w-4 h-4" />
          Export CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => handleExportAll('pdf')}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export PDF
        </Button>
      </div>

      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6">
              <div className="border rounded-lg p-6 space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tenant:</span>
                  <span className="font-medium">{selectedPayment.tenant}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold text-green-600">
                    {currencyFormatter.format(selectedPayment.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{selectedPayment.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt ID:</span>
                  <span className="font-medium text-sm">{selectedPayment.receipt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <span className="font-medium">{selectedPayment.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verified By:</span>
                  <span className="font-medium">{selectedPayment.verifiedBy}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                  Close
                </Button>
                <Button onClick={() => handleDownloadReceipt(selectedPayment)} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download as PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
