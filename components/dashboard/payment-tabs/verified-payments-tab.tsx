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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Eye, FileDown } from 'lucide-react'

const verifiedPayments = [
  {
    id: 1,
    tenant: 'John Doe',
    amount: 10000,
    method: 'M-Pesa API',
    verifiedBy: 'M-Pesa API',
    date: '2024-02-15',
    receipt: 'ABC123456789',
  },
  {
    id: 2,
    tenant: 'Jane Smith',
    amount: 25000,
    method: 'M-Pesa API',
    verifiedBy: 'M-Pesa API',
    date: '2024-02-14',
    receipt: 'DEF987654321',
  },
]

export function VerifiedPaymentsTab() {
  const [timeFilter, setTimeFilter] = useState('30')
  const [selectedPayment, setSelectedPayment] = useState<typeof verifiedPayments[0] | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  const handleViewReceipt = (payment: typeof verifiedPayments[0]) => {
    setSelectedPayment(payment)
    setShowReceiptModal(true)
  }

  const handleDownloadReceipt = (payment: typeof verifiedPayments[0]) => {
    console.log('[v0] Downloading receipt for:', payment.receipt)
  }

  const handleExportAll = (format: 'csv' | 'pdf') => {
    console.log('[v0] Exporting all verified payments as:', format)
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">M-Pesa Auto-Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">45</p>
            <p className="text-xs text-muted-foreground">KES 450,000</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Manager Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">12</p>
            <p className="text-xs text-muted-foreground">KES 120,000</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">57</p>
            <p className="text-xs text-muted-foreground">KES 570,000</p>
          </CardContent>
        </Card>
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
            {verifiedPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.tenant}</TableCell>
                <TableCell>KES {payment.amount.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge className="bg-green-600">{payment.method}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{payment.verifiedBy}</Badge>
                </TableCell>
                <TableCell>{payment.date}</TableCell>
                <TableCell className="text-sm font-mono">{payment.receipt}</TableCell>
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
            ))}
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
                  <span className="font-bold text-green-600">KES {selectedPayment.amount.toLocaleString()}</span>
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
