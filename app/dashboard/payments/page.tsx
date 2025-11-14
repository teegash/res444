'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PaymentTabs } from '@/components/dashboard/payment-tabs'
import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'

export default function PaymentsPage() {
  const [lastSynced, setLastSynced] = useState('2 minutes ago')
  const [isSyncing, setIsSyncing] = useState(false)

  const handleManualSync = () => {
    setIsSyncing(true)
    setTimeout(() => {
      setLastSynced('Just now')
      setIsSyncing(false)
    }, 2000)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8 ml-16">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Payment Verification & Management</h1>
          <p className="text-muted-foreground">Track and verify all incoming payments in real-time</p>
        </div>

        {/* Status Indicator Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <div>
                  <p className="font-semibold">Last synced: {lastSynced}</p>
                  <p className="text-sm text-muted-foreground">
                    Auto-checking M-Pesa payments every 30 seconds
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="gap-2"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      Sync M-Pesa Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <PaymentTabs />
      </div>
    </div>
  )
}
