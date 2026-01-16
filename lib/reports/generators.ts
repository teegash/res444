'use server'

import { createClient } from '@/lib/supabase/server'
import {
  calculateRevenueMetrics,
  calculateOccupancyMetrics,
  calculatePaymentMetrics,
  calculateWaterUsageMetrics,
  calculateTenantReliability,
  calculateMonthlyRevenue,
  RevenueMetrics,
  OccupancyMetrics,
  PaymentMetrics,
  WaterUsageMetrics,
  TenantReliability,
} from './calculations'
import { invoiceStatusToBoolean, isInvoiceOverdue } from '@/lib/invoices/status-utils'

export type ReportType =
  | 'monthly'
  | 'financial'
  | 'occupancy'
  | 'revenue'
  | 'utility'
  | 'performance'
  | 'rent'

export interface ReportParams {
  organizationId: string
  startDate?: string
  endDate?: string
  buildingId?: string
  format?: 'json' | 'csv' | 'pdf'
}

export interface MonthlyReport {
  period: {
    start: string
    end: string
  }
  revenue: RevenueMetrics
  occupancy: OccupancyMetrics
  payments: PaymentMetrics
  water: WaterUsageMetrics
  monthlyBreakdown: Array<{
    month: string
    rent: number
    water: number
    total: number
    paid: number
    outstanding: number
  }>
  summary: {
    totalRevenue: number
    collectionRate: number
    occupancyRate: number
    paymentReliability: number
  }
}

export interface FinancialReport {
  period: {
    start: string
    end: string
  }
  revenue: RevenueMetrics
  payments: PaymentMetrics
  outstanding: {
    total: number
    byStatus: {
      unpaid: number
      overdue: number
    }
    byBuilding: Array<{
      buildingId: string
      buildingName: string
      amount: number
    }>
  }
  cashFlow: Array<{
    date: string
    income: number
    expenses: number
    net: number
  }>
}

export interface OccupancyReport {
  totalUnits: number
  occupancy: OccupancyMetrics
  byBuilding: Array<{
    buildingId: string
    buildingName: string
    totalUnits: number
    occupied: number
    vacant: number
    occupancyRate: number
  }>
  leaseExpirations: Array<{
    leaseId: string
    tenantName: string
    unitNumber: string
    endDate: string
    daysUntilExpiry: number
  }>
}

export interface RevenueReport {
  period: {
    start: string
    end: string
  }
  revenue: RevenueMetrics
  monthlyBreakdown: Array<{
    month: string
    rent: number
    water: number
    total: number
    paid: number
    outstanding: number
  }>
  byBuilding: Array<{
    buildingId: string
    buildingName: string
    revenue: number
    units: number
    revenuePerUnit: number
  }>
  trends: {
    growth: number
    averageMonthly: number
  }
}

export interface UtilityReport {
  period: {
    start: string
    end: string
  }
  water: WaterUsageMetrics
  byBuilding: Array<{
    buildingId: string
    buildingName: string
    totalBills: number
    totalAmount: number
    averageUsage: number
  }>
  byUnit: Array<{
    unitId: string
    unitNumber: string
    buildingName: string
    totalBills: number
    totalAmount: number
    averageUsage: number
  }>
}

export interface PerformanceReport {
  period: {
    start: string
    end: string
  }
  collection: {
    rate: number
    onTime: number
    late: number
    averageDelay: number
  }
  tenantReliability: TenantReliability[]
  topPerformers: Array<{
    tenantId: string
    tenantName: string
    unitNumber: string
    reliabilityScore: number
  }>
  issues: Array<{
    tenantId: string
    tenantName: string
    unitNumber: string
    issue: string
    severity: 'low' | 'medium' | 'high'
  }>
}

export interface RentCollectionReport {
  period: {
    start: string
    end: string
  }
  collection: {
    totalInvoiced: number
    totalCollected: number
    outstanding: number
    collectionRate: number
  }
  byMonth: Array<{
    month: string
    invoiced: number
    collected: number
    outstanding: number
    rate: number
  }>
  overdue: Array<{
    invoiceId: string
    tenantName: string
    unitNumber: string
    amount: number
    daysOverdue: number
  }>
}

/**
 * Generate monthly report
 */
export async function generateMonthlyReport(
  params: ReportParams
): Promise<MonthlyReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const [revenue, occupancy, payments, water, monthlyBreakdown] =
    await Promise.all([
      calculateRevenueMetrics(params.organizationId, startDate, endDate),
      calculateOccupancyMetrics(params.organizationId),
      calculatePaymentMetrics(params.organizationId, startDate, endDate),
      calculateWaterUsageMetrics(params.organizationId, startDate, endDate),
      calculateMonthlyRevenue(params.organizationId, startDate, endDate),
    ])

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    revenue,
    occupancy,
    payments,
    water,
    monthlyBreakdown,
    summary: {
      totalRevenue: revenue.totalRevenue,
      collectionRate: revenue.collectionRate,
      occupancyRate: occupancy.occupancyRate,
      paymentReliability: payments.paymentReliability,
    },
  }
}

/**
 * Generate financial report
 */
export async function generateFinancialReport(
  params: ReportParams
): Promise<FinancialReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), 0, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const [revenue, payments] = await Promise.all([
    calculateRevenueMetrics(params.organizationId, startDate, endDate),
    calculatePaymentMetrics(params.organizationId, startDate, endDate),
  ])

  const supabase = await createClient()

  // Get outstanding invoices by status
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      `
      id,
      amount,
      status,
      due_date,
      leases (
        unit_id,
        apartment_units (
          building_id,
          apartment_buildings (
            id,
            name,
            organization_id
          )
        )
      )
    `
    )
    .eq('status', false)

  const outstandingByStatus = {
    unpaid: 0,
    overdue: 0,
  }

  const buildingOutstanding = new Map<
    string,
    { buildingId: string; buildingName: string; amount: number }
  >()

  if (invoices) {
    for (const invoice of invoices) {
      const lease = invoice.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== params.organizationId) continue

      const amount = parseFloat(invoice.amount.toString())

      const overdue = isInvoiceOverdue(invoice.status, invoice.due_date)
      if (overdue) {
        outstandingByStatus.overdue += amount
      } else {
        outstandingByStatus.unpaid += amount
      }

      // Group by building
      if (building?.id) {
        if (!buildingOutstanding.has(building.id)) {
          buildingOutstanding.set(building.id, {
            buildingId: building.id,
            buildingName: building.name || 'Unknown',
            amount: 0,
          })
        }
        buildingOutstanding.get(building.id)!.amount += amount
      }
    }
  }

  // Generate cash flow (simplified - daily aggregation)
  const monthlyBreakdown = await calculateMonthlyRevenue(
    params.organizationId,
    startDate,
    endDate
  )

  const cashFlow = monthlyBreakdown.map((month) => ({
    date: month.month,
    income: month.paid,
    expenses: 0, // Would need expenses table
    net: month.paid,
  }))

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    revenue,
    payments,
    outstanding: {
      total: revenue.outstandingAmount,
      byStatus: outstandingByStatus,
      byBuilding: Array.from(buildingOutstanding.values()),
    },
    cashFlow,
  }
}

/**
 * Generate occupancy report
 */
export async function generateOccupancyReport(
  params: ReportParams
): Promise<OccupancyReport> {
  const occupancy = await calculateOccupancyMetrics(params.organizationId)

  const supabase = await createClient()

  // Get occupancy by building
  const { data: buildings } = await supabase
    .from('apartment_buildings')
    .select(
      `
      id,
      name,
      apartment_units (
        id,
        status
      )
    `
    )
    .eq('organization_id', params.organizationId)

  const byBuilding =
    buildings?.map((building) => {
      const units = building.apartment_units as any[]
      const totalUnits = units.length
      const occupied = units.filter((u) => u.status === 'occupied').length
      const vacant = units.filter((u) => u.status === 'vacant').length
      const occupancyRate =
        totalUnits > 0 ? (occupied / totalUnits) * 100 : 0

      return {
        buildingId: building.id,
        buildingName: building.name,
        totalUnits,
        occupied,
        vacant,
        occupancyRate: Math.round(occupancyRate * 100) / 100,
      }
    }) || []

  // Get lease expirations
  const { data: leases } = await supabase
    .from('leases')
    .select(
      `
      id,
      end_date,
      tenant_user_id,
      unit_id,
      apartment_units (
        unit_number,
        building_id,
        apartment_buildings (
          organization_id
        )
      )
    `
    )
    .in('status', ['active', 'renewed'])
    .not('end_date', 'is', null)

  const leaseExpirations: OccupancyReport['leaseExpirations'] = []

  if (leases) {
    for (const lease of leases) {
      const unit = lease.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== params.organizationId) continue

      const endDate = new Date(lease.end_date)
      const today = new Date()
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Get tenant name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', lease.tenant_user_id)
        .single()

      leaseExpirations.push({
        leaseId: lease.id,
        tenantName: (profile?.full_name as string) || 'Unknown',
        unitNumber: unit?.unit_number || 'Unknown',
        endDate: lease.end_date,
        daysUntilExpiry,
      })
    }
  }

  // Sort by days until expiry
  leaseExpirations.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)

  return {
    totalUnits: occupancy.totalUnits,
    occupancy,
    byBuilding,
    leaseExpirations: leaseExpirations.slice(0, 50), // Top 50
  }
}

/**
 * Generate revenue report
 */
export async function generateRevenueReport(
  params: ReportParams
): Promise<RevenueReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), 0, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const [revenue, monthlyBreakdown] = await Promise.all([
    calculateRevenueMetrics(params.organizationId, startDate, endDate),
    calculateMonthlyRevenue(params.organizationId, startDate, endDate),
  ])

  const supabase = await createClient()

  // Get revenue by building
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      `
      id,
      amount,
      status,
      payment_date,
      leases (
        unit_id,
        apartment_units (
          building_id,
          apartment_buildings (
            id,
            name,
            organization_id
          )
        )
      )
    `
    )
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  const buildingRevenue = new Map<
    string,
    {
      buildingId: string
      buildingName: string
      revenue: number
      units: Set<string>
    }
  >()

  if (invoices) {
    for (const invoice of invoices) {
      const lease = invoice.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== params.organizationId) continue

      if (!buildingRevenue.has(building.id)) {
        buildingRevenue.set(building.id, {
          buildingId: building.id,
          buildingName: building.name || 'Unknown',
          revenue: 0,
          units: new Set(),
        })
      }

      const data = buildingRevenue.get(building.id)!
      if (invoiceStatusToBoolean(invoice.status) || invoice.payment_date) {
        data.revenue += parseFloat(invoice.amount.toString())
      }
      data.units.add(unit?.id)
    }
  }

  const byBuilding = Array.from(buildingRevenue.values()).map((data) => ({
    buildingId: data.buildingId,
    buildingName: data.buildingName,
    revenue: Math.round(data.revenue * 100) / 100,
    units: data.units.size,
    revenuePerUnit:
      data.units.size > 0
        ? Math.round((data.revenue / data.units.size) * 100) / 100
        : 0,
  }))

  // Calculate trends
  const months = monthlyBreakdown.length
  const firstMonth = monthlyBreakdown[0]?.total || 0
  const lastMonth = monthlyBreakdown[months - 1]?.total || 0
  const growth =
    firstMonth > 0 ? ((lastMonth - firstMonth) / firstMonth) * 100 : 0
  const averageMonthly =
    months > 0
      ? monthlyBreakdown.reduce((sum, m) => sum + m.total, 0) / months
      : 0

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    revenue,
    monthlyBreakdown,
    byBuilding,
    trends: {
      growth: Math.round(growth * 100) / 100,
      averageMonthly: Math.round(averageMonthly * 100) / 100,
    },
  }
}

/**
 * Generate utility report (water)
 */
export async function generateUtilityReport(
  params: ReportParams
): Promise<UtilityReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), 0, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const water = await calculateWaterUsageMetrics(
    params.organizationId,
    startDate,
    endDate
  )

  const supabase = await createClient()

  // Get water bills by building
  const { data: waterBills } = await supabase
    .from('water_bills')
    .select(
      `
      id,
      amount,
      units_consumed,
      unit_id,
      apartment_units (
        unit_number,
        building_id,
        apartment_buildings (
          id,
          name,
          organization_id
        )
      )
    `
    )
    .gte('billing_month', startDate.toISOString().split('T')[0])
    .lte('billing_month', endDate.toISOString().split('T')[0])

  const buildingWater = new Map<
    string,
    {
      buildingId: string
      buildingName: string
      bills: number
      amount: number
      usage: number
    }
  >()

  const unitWater = new Map<
    string,
    {
      unitId: string
      unitNumber: string
      buildingName: string
      bills: number
      amount: number
      usage: number
    }
  >()

  if (waterBills) {
    for (const bill of waterBills) {
      const unit = bill.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== params.organizationId) continue

      const amount = parseFloat(bill.amount.toString())
      const usage = bill.units_consumed
        ? parseFloat(bill.units_consumed.toString())
        : 0

      // By building
      if (!buildingWater.has(building.id)) {
        buildingWater.set(building.id, {
          buildingId: building.id,
          buildingName: building.name || 'Unknown',
          bills: 0,
          amount: 0,
          usage: 0,
        })
      }
      const buildingData = buildingWater.get(building.id)!
      buildingData.bills++
      buildingData.amount += amount
      buildingData.usage += usage

      // By unit
      if (!unitWater.has(unit.id)) {
        unitWater.set(unit.id, {
          unitId: unit.id,
          unitNumber: unit.unit_number || 'Unknown',
          buildingName: building.name || 'Unknown',
          bills: 0,
          amount: 0,
          usage: 0,
        })
      }
      const unitData = unitWater.get(unit.id)!
      unitData.bills++
      unitData.amount += amount
      unitData.usage += usage
    }
  }

  const byBuilding = Array.from(buildingWater.values()).map((data) => ({
    buildingId: data.buildingId,
    buildingName: data.buildingName,
    totalBills: data.bills,
    totalAmount: Math.round(data.amount * 100) / 100,
    averageUsage:
      data.bills > 0 ? Math.round((data.usage / data.bills) * 100) / 100 : 0,
  }))

  const byUnit = Array.from(unitWater.values())
    .map((data) => ({
      unitId: data.unitId,
      unitNumber: data.unitNumber,
      buildingName: data.buildingName,
      totalBills: data.bills,
      totalAmount: Math.round(data.amount * 100) / 100,
      averageUsage:
        data.bills > 0
          ? Math.round((data.usage / data.bills) * 100) / 100
          : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 100) // Top 100 units

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    water,
    byBuilding,
    byUnit,
  }
}

/**
 * Generate performance report
 */
export async function generatePerformanceReport(
  params: ReportParams
): Promise<PerformanceReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), 0, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const [payments, tenantReliability] = await Promise.all([
    calculatePaymentMetrics(params.organizationId, startDate, endDate),
    calculateTenantReliability(params.organizationId, startDate, endDate),
  ])

  const topPerformers = tenantReliability
    .filter((t) => t.reliabilityScore >= 80)
    .slice(0, 10)
    .map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      unitNumber: t.unitNumber,
      reliabilityScore: t.reliabilityScore,
    }))

  const issues: PerformanceReport['issues'] = []

  // Identify issues
  for (const tenant of tenantReliability) {
    if (tenant.reliabilityScore < 50) {
      issues.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        unitNumber: tenant.unitNumber,
        issue: `Low payment reliability (${tenant.reliabilityScore}%)`,
        severity: 'high' as const,
      })
    } else if (tenant.averageDelayDays > 7) {
      issues.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        unitNumber: tenant.unitNumber,
        issue: `High average payment delay (${tenant.averageDelayDays} days)`,
        severity: tenant.averageDelayDays > 14 ? ('high' as const) : ('medium' as const),
      })
    } else if (tenant.latePayments > tenant.onTimePayments) {
      issues.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        unitNumber: tenant.unitNumber,
        issue: 'More late payments than on-time payments',
        severity: 'medium' as const,
      })
    }
  }

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    collection: {
      rate: payments.paymentReliability,
      onTime: payments.onTimePayments,
      late: payments.latePayments,
      averageDelay: payments.averagePaymentDelay,
    },
    tenantReliability,
    topPerformers,
    issues,
  }
}

/**
 * Generate rent collection report
 */
export async function generateRentCollectionReport(
  params: ReportParams
): Promise<RentCollectionReport> {
  const startDate = params.startDate
    ? new Date(params.startDate)
    : new Date(new Date().getFullYear(), 0, 1)
  const endDate = params.endDate
    ? new Date(params.endDate)
    : new Date()

  const revenue = await calculateRevenueMetrics(
    params.organizationId,
    startDate,
    endDate
  )

  const monthlyBreakdown = await calculateMonthlyRevenue(
    params.organizationId,
    startDate,
    endDate
  )

  const byMonth = monthlyBreakdown.map((month) => ({
    month,
    invoiced: month.total,
    collected: month.paid,
    outstanding: month.outstanding,
    rate: month.total > 0 ? (month.paid / month.total) * 100 : 0,
  }))

  const supabase = await createClient()

  // Get overdue invoices
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select(
      `
      id,
      amount,
      due_date,
      invoice_type,
      leases (
        tenant_user_id,
        unit_id,
        apartment_units (
          unit_number,
          building_id,
          apartment_buildings (
            organization_id
          )
        )
      )
    `
    )
    .eq('status', 'overdue')
    .eq('invoice_type', 'rent')

  const overdue: RentCollectionReport['overdue'] = []

  if (overdueInvoices) {
    const today = new Date()

    for (const invoice of overdueInvoices) {
      const lease = invoice.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== params.organizationId) continue

      const dueDate = new Date(invoice.due_date)
      const daysOverdue = Math.ceil(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Get tenant name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', lease.tenant_user_id)
        .single()

      overdue.push({
        invoiceId: invoice.id,
        tenantName: (profile?.full_name as string) || 'Unknown',
        unitNumber: unit?.unit_number || 'Unknown',
        amount: parseFloat(invoice.amount.toString()),
        daysOverdue,
      })
    }
  }

  // Sort by days overdue (descending)
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)

  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
    collection: {
      totalInvoiced: revenue.totalInvoiced,
      totalCollected: revenue.totalPaid,
      outstanding: revenue.outstandingAmount,
      collectionRate: revenue.collectionRate,
    },
    byMonth: byMonth.map((m) => ({
      month: m.month,
      invoiced: m.invoiced,
      collected: m.collected,
      outstanding: m.outstanding,
      rate: Math.round(m.rate * 100) / 100,
    })),
    overdue: overdue.slice(0, 100), // Top 100 overdue
  }
}
