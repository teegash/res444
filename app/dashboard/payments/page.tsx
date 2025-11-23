
'use client'

import { useCallback, useMemo, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PaymentTabs } from '@/components/dashboard/payment-tabs'
import { Activity } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { IntegrationSummary } from '@/components/dashboard/payment-tabs/types'
import { SkeletonLoader } from '@/components/ui/skeletons'

export default function PaymentsPage() {
  const { toast } = useToast()
  const [manualSyncedAt, setManualSyncedAt] = useState<string | null>(null)
  const [autoSyncedAt, setAutoSyncedAt] = useState<string | null>(null)
  const [autoCheckFrequency, setAutoCheckFrequency] = useState<number>(30)
  const [isSyncing, setIsSyncing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const lastSyncedLabel = useMemo(() => {
    const basis = manualSyncedAt || autoSyncedAt
    if (!basis) return 'Never'
    return new Date(basis).toLocaleString()
  }, [manualSyncedAt, autoSyncedAt])

  const handleManualSync = async () => {
    try {
      setIsSyncing(true)
      const response = await fetch('/api/manager/payments', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Manual sync failed.')
      }
      toast({
        title: 'M-Pesa sync complete',
        description: payload.message || 'Payment statuses refreshed.',
      })
      const now = new Date().toISOString()
      setManualSyncedAt(now)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unable to sync payments.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleIntegrationUpdate = useCallback((integration: IntegrationSummary | null) => {
    setAutoSyncedAt(integration?.lastAutoCheck || null)
    setAutoCheckFrequency(Math.max(5, integration?.autoVerifyFrequencySeconds || 30))
    setLoadingSummary(false)
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 bg-slate-50">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Payment Verification & Management</h1>
            <p className="text-muted-foreground">Track and verify all incoming payments in real-time.</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loadingSummary ? (
                <div className="space-y-2">
                  <SkeletonLoader height={16} width="60%" />
                  <SkeletonLoader height={12} width="70%" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    <div>
                      <p className="font-semibold">Last sync: {lastSyncedLabel}</p>
                      <p className="text-sm text-muted-foreground">
                        Auto-checking M-Pesa payments every {autoCheckFrequency} seconds via Daraja
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
              )}
            </CardContent>
          </Card>

          <PaymentTabs refreshKey={refreshKey} onIntegrationUpdate={handleIntegrationUpdate} />
        </main>
      </div>
    </div>
  )
}
