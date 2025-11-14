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
import { CheckCircle2, XCircle, Eye, Clock, Shield } from 'lucide-react'
import Image from 'next/image'

const pendingDeposits = [
  {
    id: 1,
    tenant: 'Mary Wanjiku',
    property: 'Westlands Plaza',
    unit: 'B-205',
    amount: 38000,
    period: 'December 2024',
    bankReference: 'BK12345789',
    uploadedDate: 'Dec 1, 2024',
    uploadedTime: '10:30 AM',
    slipUrl: '/bank-deposit-slip.jpg',
  },
  {
    id: 2,
    tenant: 'David Kiprop',
    property: 'Kilimani Heights',
    unit: 'A-103',
    amount: 45000,
    period: 'December 2024',
    bankReference: 'BK987654321',
    uploadedDate: 'Dec 2, 2024',
    uploadedTime: '2:15 PM',
    slipUrl: '/bank-deposit-slip.jpg',
  },
]

const confirmedDeposits = [
  {
    id: 3,
    tenant: 'Grace Akinyi',
    property: 'Karen Villas',
    unit: 'C-201',
    amount: 52000,
    period: 'November 2024',
  },
]

export function ConfirmDepositsTab() {
  const [selectedDeposit, setSelectedDeposit] = useState<typeof pendingDeposits[0] | null>(null)

  const handleConfirm = (depositId: number) => {
    console.log('[v0] Confirming deposit:', depositId)
  }

  const handleReject = (depositId: number) => {
    console.log('[v0] Rejecting deposit:', depositId)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
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
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Confirmation Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-yellow-600" />
            <h2 className="text-xl font-bold">Pending Confirmation</h2>
          </div>

          <div className="space-y-4">
            {pendingDeposits.map((deposit) => (
              <Card key={deposit.id} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-lg font-bold">{deposit.tenant}</h3>
                        <Badge className="bg-yellow-500">Pending Review</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div>
                          <span className="text-gray-600">Property</span>
                          <p className="font-semibold">{deposit.property}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Unit</span>
                          <p className="font-semibold">{deposit.unit}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Amount</span>
                          <p className="font-bold text-[#4682B4]">KES {deposit.amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Period</span>
                          <p className="font-semibold">{deposit.period}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Bank Reference</span>
                          <p className="font-semibold">{deposit.bankReference}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Uploaded</span>
                          <p className="font-semibold">{deposit.uploadedDate} {deposit.uploadedTime}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="gap-2" onClick={() => setSelectedDeposit(deposit)}>
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
                            <img
                              src={deposit.slipUrl || "/placeholder.svg"}
                              alt="Deposit Slip"
                              className="w-full rounded-lg border"
                            />
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Button className="gap-2 bg-[#4682B4] hover:bg-[#4682B4]/90" onClick={() => handleConfirm(deposit.id)}>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm
                      </Button>

                      <Button variant="destructive" className="gap-2" onClick={() => handleReject(deposit.id)}>
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmed Deposits Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-bold">Confirmed Deposits</h2>
          </div>

          <div className="space-y-3">
            {confirmedDeposits.map((deposit) => (
              <Card key={deposit.id} className="border-green-200 bg-green-50/30">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{deposit.tenant}</h3>
                        <Badge className="bg-green-600">Confirmed</Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        {deposit.property} • Unit {deposit.unit} • KES {deposit.amount.toLocaleString()} • {deposit.period}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">View Details</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
