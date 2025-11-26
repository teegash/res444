'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CheckCircle2, XCircle, Eye, Clock } from 'lucide-react'
import { PaymentRecord } from '@/components/dashboard/payment-tabs/types'
import { SkeletonTable } from '@/components/ui/skeletons'

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

const formatPeriod = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

interface ConfirmDepositsTabProps {
  pendingDeposits: PaymentRecord[]
  confirmedDeposits: PaymentRecord[]
  rejectedCount: number
  loading: boolean
  onActionComplete?: () => void
}

export function ConfirmDepositsTab({
  pendingDeposits,
  confirmedDeposits,
  rejectedCount,
  loading,
  onActionComplete,
}: ConfirmDepositsTabProps) {
  const [selectedDeposit, setSelectedDeposit] = useState<PaymentRecord | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const pendingAmount = pendingDeposits.reduce((sum, deposit) => sum + deposit.amount, 0)
  const confirmedAmount = confirmedDeposits.reduce((sum, deposit) => sum + deposit.amount, 0)

  const handleConfirm = async (depositId: string) => {
    try {
      setActionLoading(depositId + '-confirm')
      const res = await fetch(`/api/manager/payments/${depositId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to approve deposit.')
      }
      onActionComplete?.()
    } catch (error) {
      console.error('[ConfirmDeposits] approve failed', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (depositId: string) => {
    try {
      setActionLoading(depositId + '-reject')
      const res = await fetch(`/api/manager/payments/${depositId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: 'Payment details do not match' }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to reject deposit.')
      }
      onActionComplete?.()
    } catch (error) {
      console.error('[ConfirmDeposits] reject failed', error)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending Review</p>
                <p className="text-2xl font-bold">{pendingDeposits.length}</p>
                <p className="text-xs text-muted-foreground">
                  {currencyFormatter.format(pendingAmount)} awaiting confirmation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Confirmed</p>
                <p className="text-2xl font-bold">{confirmedDeposits.length}</p>
                <p className="text-xs text-muted-foreground">
                  {currencyFormatter.format(confirmedAmount)} verified
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Rejected</p>
                <p className="text-2xl font-bold">{rejectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-yellow-600" />
            <h2 className="text-xl font-bold">Pending Confirmation</h2>
          </div>

          <div className="space-y-4">
            {loading ? (
              <SkeletonTable rows={4} columns={4} />
            ) : pendingDeposits.length === 0 ? (
              <Card className="border-2">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No pending deposit verifications.
                </CardContent>
              </Card>
            ) : (
              pendingDeposits.map((deposit) => (
                <Card key={deposit.id} className="border-2">
                  <CardContent className="pt-6">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold">{deposit.tenantName}</h3>
                          <Badge className="bg-yellow-500">Pending Review</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                          <div>
                            <span className="text-gray-600">Property</span>
                            <p className="font-semibold">{deposit.propertyName || '—'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Unit</span>
                            <p className="font-semibold">{deposit.unitLabel || '—'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Amount</span>
                            <p className="font-bold text-[#4682B4]">{currencyFormatter.format(deposit.amount)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Period</span>
                            <p className="font-semibold">{formatPeriod(deposit.invoiceDueDate)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Bank Reference</span>
                            <p className="font-semibold">{deposit.bankReferenceNumber || '—'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Uploaded</span>
                            <p className="font-semibold">{formatPeriod(deposit.paymentDate)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => setSelectedDeposit(deposit)}
                            >
                              <Eye className="w-4 h-4" />
                              View Slip
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Bank Deposit Slip</DialogTitle>
                              <DialogDescription>Review the uploaded deposit slip</DialogDescription>
                            </DialogHeader>
                            <div className="mt-4">
                              {selectedDeposit?.depositSlipUrl ? (
                                <img
                                  src={selectedDeposit.depositSlipUrl}
                                  alt="Deposit Slip"
                                  className="w-full rounded-lg border"
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground">No slip uploaded.</p>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button
                          className="gap-2 bg-[#4682B4] hover:bg-[#4682B4]/90"
                          disabled={actionLoading === deposit.id + '-confirm'}
                          onClick={() => handleConfirm(deposit.id)}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {actionLoading === deposit.id + '-confirm' ? 'Confirming…' : 'Confirm'}
                        </Button>

                        <Button
                          variant="destructive"
                          className="gap-2"
                          disabled={actionLoading === deposit.id + '-reject'}
                          onClick={() => handleReject(deposit.id)}
                        >
                          <XCircle className="w-4 h-4" />
                          {actionLoading === deposit.id + '-reject' ? 'Rejecting…' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-bold">Recently Confirmed</h2>
          </div>
          {confirmedDeposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No confirmed deposits yet.</p>
          ) : (
            <div className="grid gap-4">
              {confirmedDeposits.map((deposit) => (
                <Card key={deposit.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{deposit.tenantName}</h3>
                        <p className="text-sm text-gray-600">
                          {deposit.propertyName || '—'} • {deposit.unitLabel || '—'}
                        </p>
                      </div>
                      <Badge className="bg-green-600">Confirmed</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-sm text-gray-600">{formatPeriod(deposit.invoiceDueDate)}</p>
                      <p className="font-bold text-green-600">{currencyFormatter.format(deposit.amount)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
