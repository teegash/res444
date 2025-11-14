'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PendingVerificationTab } from '@/components/dashboard/payment-tabs/pending-verification-tab'
import { VerifiedPaymentsTab } from '@/components/dashboard/payment-tabs/verified-payments-tab'
import { FailedPaymentsTab } from '@/components/dashboard/payment-tabs/failed-payments-tab'
import { IntegrationStatusTab } from '@/components/dashboard/payment-tabs/integration-status-tab'
import { ConfirmDepositsTab } from '@/components/dashboard/payment-tabs/confirm-deposits-tab'

export function PaymentTabs() {
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
        <PendingVerificationTab />
      </TabsContent>

      <TabsContent value="deposits" className="mt-6">
        <ConfirmDepositsTab />
      </TabsContent>

      <TabsContent value="verified" className="mt-6">
        <VerifiedPaymentsTab />
      </TabsContent>

      <TabsContent value="failed" className="mt-6">
        <FailedPaymentsTab />
      </TabsContent>

      <TabsContent value="status" className="mt-6">
        <IntegrationStatusTab />
      </TabsContent>
    </Tabs>
  )
}
