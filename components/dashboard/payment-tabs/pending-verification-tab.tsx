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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, RotateCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const pendingPayments = [
  {
    id: 1,
    tenant: 'John Doe',
    amount: 10000,
    type: 'Rent',
    method: 'M-Pesa',
    date: '2024-02-01',
    status: 'auto-checking',
    receipt: 'ABC123456789',
    phone: '+254XXXX5678',
    checkedTime: '30 sec ago',
  },
  {
    id: 2,
    tenant: 'Jane Smith',
    amount: 25000,
    type: 'Rent',
    method: 'M-Pesa',
    date: '2024-02-01',
    status: 'verified',
    receipt: 'DEF987654321',
    verifiedTime: '5 minutes ago',
  },
  {
    id: 3,
    tenant: 'Bob Wilson',
    amount: 10000,
    type: 'Water',
    method: 'M-Pesa',
    date: '2024-02-01',
    status: 'failed',
    error: 'Insufficient funds',
  },
  {
    id: 4,
    tenant: 'Mary Johnson',
    amount: 15000,
    type: 'Rent',
    method: 'Bank Transfer',
    date: '2024-02-01',
    status: 'awaiting-slip',
  },
  {
    id: 5,
    tenant: 'Tom Lee',
    amount: 10000,
    type: 'Water',
    method: 'Cash',
    date: '2024-02-01',
    status: 'pending',
  },
]

export function PendingVerificationTab() {
  return (
    <div className="space-y-6">
      {/* Auto-Update Indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <div>
              <p className="font-semibold">Auto-checking M-Pesa payments every 30 seconds</p>
              <p className="text-sm text-muted-foreground">Last checked: 2 minutes ago</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant Name</TableHead>
              <TableHead>Amount (KES)</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.tenant}</TableCell>
                <TableCell>KES {payment.amount.toLocaleString()}</TableCell>
                <TableCell>{payment.type}</TableCell>
                <TableCell>{payment.method}</TableCell>
                <TableCell>{payment.date}</TableCell>
                <TableCell>
                  {payment.status === 'auto-checking' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-spin" />
                            Auto-Checking...
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Receipt: {payment.receipt}</p>
                          <p>Phone: {payment.phone}</p>
                          <p>Checked: {payment.checkedTime}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {payment.status === 'verified' && (
                    <Badge className="gap-1 bg-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      Auto-Verified
                    </Badge>
                  )}
                  {payment.status === 'failed' && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Failed
                    </Badge>
                  )}
                  {payment.status === 'awaiting-slip' && (
                    <Badge variant="secondary">Awaiting Slip</Badge>
                  )}
                  {payment.status === 'pending' && (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {payment.status === 'failed' && (
                    <Button variant="ghost" size="sm">
                      Retry
                    </Button>
                  )}
                  {payment.status === 'verified' && (
                    <Button variant="ghost" size="sm">
                      View Receipt
                    </Button>
                  )}
                  {payment.status === 'awaiting-slip' && (
                    <Button variant="ghost" size="sm">
                      Verify
                    </Button>
                  )}
                  {payment.status === 'pending' && (
                    <Button variant="ghost" size="sm">
                      Confirm
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
