
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PendingVerificationTab } from '@/components/dashboard/payment-tabs/pending-verification-tab'
import { VerifiedPaymentsTab } from '@/components/dashboard/payment-tabs/verified-payments-tab'
import { FailedPaymentsTab } from '@/components/dashboard/payment-tabs/failed-payments-tab'
import { IntegrationStatusTab } from '@/components/dashboard/payment-tabs/integration-status-tab'
import { ConfirmDepositsTab } from '@/components/dashboard/payment-tabs/confirm-deposits-tab'
import { PaymentRecord, PaymentStats, IntegrationSummary, FailureBreakdown } from '@/components/dashboard/payment-tabs/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PaymentsDashboardData = {
  pending: PaymentRecord[]
  deposits: {
    pending: PaymentRecord[]
    confirmed: PaymentRecord[]
    rejectedCount: number
  }
  verified: PaymentRecord[]
  failed: PaymentRecord[]
  stats: PaymentStats
  breakdown: FailureBreakdown[]
  integration: IntegrationSummary
}

interface PaymentTabsProps {
  refreshKey: number
  onIntegrationUpdate?: (integration: IntegrationSummary | null) => void
  propertyId?: string | null
}

export function PaymentTabs({ refreshKey, onIntegrationUpdate, propertyId }: PaymentTabsProps) {
  const [data, setData] = useState<PaymentsDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const autoSyncingRef = useRef(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/manager/payments', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch payment data.')
      }
      const scopedData = (() => {
        if (!propertyId) return payload.data
        if (!payload.data) return null
        const filterPayments = (list?: PaymentRecord[]) =>
          (list || []).filter((payment) => !propertyId || payment.propertyId === propertyId)

        const scopedPending = filterPayments(payload.data.pending)
        const scopedFailed = filterPayments(payload.data.failed)
        const scopedVerified = filterPayments(payload.data.verified)
        const scopedPendingDeposits = filterPayments(payload.data.deposits?.pending)
        const scopedConfirmedDeposits = filterPayments(payload.data.deposits?.confirmed)

        const scopedStats: PaymentStats = {
          pendingAmount: scopedPending.reduce((sum, p) => sum + p.amount, 0),
          pendingCount: scopedPending.length,
          depositsPendingAmount: scopedPendingDeposits.reduce((sum, p) => sum + p.amount, 0),
          depositsPendingCount: scopedPendingDeposits.length,
          depositsRejectedCount: payload.data.stats.depositsRejectedCount, // maintain source
          verifiedAmount: scopedVerified.reduce((sum, p) => sum + p.amount, 0),
          verifiedCount: scopedVerified.length,
          autoVerifiedAmount: scopedVerified
            .filter((p) => p.paymentMethod === 'mpesa' && p.mpesaAutoVerified)
            .reduce((sum, p) => sum + p.amount, 0),
          autoVerifiedCount: scopedVerified.filter((p) => p.paymentMethod === 'mpesa' && p.mpesaAutoVerified).length,
          managerVerifiedAmount: scopedVerified
            .filter((p) => !p.mpesaAutoVerified)
            .reduce((sum, p) => sum + p.amount, 0),
          managerVerifiedCount: scopedVerified.filter((p) => !p.mpesaAutoVerified).length,
          failedAmount: scopedFailed.reduce((sum, p) => sum + p.amount, 0),
          failedCount: scopedFailed.length,
        }

        return {
          ...payload.data,
          pending: scopedPending,
          deposits: {
            ...payload.data.deposits,
            pending: scopedPendingDeposits,
            confirmed: scopedConfirmedDeposits,
          },
          verified: scopedVerified,
          failed: scopedFailed,
          stats: scopedStats,
        }
      })()
      setData(scopedData)
      onIntegrationUpdate?.(scopedData?.integration || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment data.')
      setData(null)
      onIntegrationUpdate?.(null)
    } finally {
      setLoading(false)
    }
  }, [onIntegrationUpdate, propertyId])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  const runAutoSync = useCallback(async () => {
    if (autoSyncingRef.current) {
      return
    }
    autoSyncingRef.current = true
    try {
      const response = await fetch('/api/manager/payments', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Auto-verification request failed.')
      }
      await fetchData()
    } catch (err) {
      console.warn('[PaymentTabs] Auto-sync failed', err)
    } finally {
      autoSyncingRef.current = false
    }
  }, [fetchData])

  useEffect(() => {
    if (!data?.integration?.autoVerifyEnabled) {
      return
    }
    const frequencySeconds = Math.max(5, data.integration.autoVerifyFrequencySeconds || 30)
    const interval = setInterval(() => {
      runAutoSync()
    }, frequencySeconds * 1000)
    return () => clearInterval(interval)
  }, [data?.integration?.autoVerifyEnabled, data?.integration?.autoVerifyFrequencySeconds, runAutoSync])

  if (error) {
    return (
      <Card className="mt-6">
        <CardContent className="py-10 text-center space-y-4">
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={fetchData} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-5">
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="deposits">Deposits</TabsTrigger>
        <TabsTrigger value="verified">Verified</TabsTrigger>
        <TabsTrigger value="failed">Failed</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-6">
        <PendingVerificationTab
          payments={data?.pending || []}
          loading={loading}
          lastChecked={data?.integration?.lastAutoCheck || null}
          pollFrequencySeconds={data?.integration?.autoVerifyFrequencySeconds}
        />
      </TabsContent>

      <TabsContent value="deposits" className="mt-6">
        <ConfirmDepositsTab
          pendingDeposits={data?.deposits?.pending || []}
          confirmedDeposits={data?.deposits?.confirmed || []}
          rejectedCount={data?.deposits?.rejectedCount || 0}
          loading={loading}
          onActionComplete={fetchData}
        />
      </TabsContent>

      <TabsContent value="verified" className="mt-6">
        <VerifiedPaymentsTab payments={data?.verified || []} stats={data?.stats} loading={loading} />
      </TabsContent>

      <TabsContent value="failed" className="mt-6">
        <FailedPaymentsTab
          payments={data?.failed || []}
          breakdown={data?.breakdown || []}
          loading={loading}
        />
      </TabsContent>

      <TabsContent value="status" className="mt-6">
        <IntegrationStatusTab
          stats={data?.stats}
          integration={data?.integration}
          loading={loading}
          onSettingsUpdated={fetchData}
        />
      </TabsContent>
    </Tabs>
  )
}
