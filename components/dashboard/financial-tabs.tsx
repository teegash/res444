'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverviewTab } from '@/components/dashboard/financial-tabs/overview-tab'
import { MonthlyReportsTab } from '@/components/dashboard/financial-tabs/monthly-reports-tab'
import { UtilityReportsTab } from '@/components/dashboard/financial-tabs/utility-reports-tab'
import { RevenueReportsTab } from '@/components/dashboard/financial-tabs/revenue-reports-tab'
import { OccupancyReportsTab } from '@/components/dashboard/financial-tabs/occupancy-reports-tab'

export function FinancialTabs() {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
        <TabsTrigger value="utility">Utility</TabsTrigger>
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <OverviewTab />
      </TabsContent>

      <TabsContent value="monthly" className="mt-6">
        <MonthlyReportsTab />
      </TabsContent>

      <TabsContent value="utility" className="mt-6">
        <UtilityReportsTab />
      </TabsContent>

      <TabsContent value="revenue" className="mt-6">
        <RevenueReportsTab />
      </TabsContent>

      <TabsContent value="occupancy" className="mt-6">
        <OccupancyReportsTab />
      </TabsContent>
    </Tabs>
  )
}
