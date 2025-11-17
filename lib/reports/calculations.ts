'use server'

import { createClient } from '@/lib/supabase/server'
import { invoiceStatusToBoolean } from '@/lib/invoices/status-utils'

export interface RevenueMetrics {
  totalRevenue: number
  rentRevenue: number
  waterRevenue: number
  outstandingAmount: number
  collectionRate: number
  totalInvoiced: number
  totalPaid: number
}

export interface OccupancyMetrics {
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  maintenanceUnits: number
  occupancyRate: number
  vacancyRate: number
}

export interface PaymentMetrics {
  totalPayments: number
  onTimePayments: number
  latePayments: number
  averagePaymentDelay: number
  paymentReliability: number
}

export interface WaterUsageMetrics {
  totalWaterBills: number
  totalWaterAmount: number
  averageUsagePerUnit: number
  unitsWithBills: number
}

export interface TenantReliability {
  tenantId: string
  tenantName: string
  unitNumber: string
  totalInvoices: number
  paidInvoices: number
  latePayments: number
  onTimePayments: number
  reliabilityScore: number
  averageDelayDays: number
}

/**
 * Calculate revenue metrics for a date range
 */
export async function calculateRevenueMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<RevenueMetrics> {
  try {
    const supabase = await createClient()

    // Get all invoices for the organization in date range
    const { data: invoices } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_type,
        amount,
        status,
        payment_date,
        due_date,
        leases (
          unit_id,
          apartment_units (
            building_id,
            apartment_buildings (
              organization_id
            )
          )
        )
      `
      )
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (!invoices || invoices.length === 0) {
      return {
        totalRevenue: 0,
        rentRevenue: 0,
        waterRevenue: 0,
        outstandingAmount: 0,
        collectionRate: 0,
        totalInvoiced: 0,
        totalPaid: 0,
      }
    }

    // Filter invoices for this organization
    const orgInvoices = invoices.filter((inv) => {
      const lease = inv.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any
      return building?.organization_id === organizationId
    })

    let totalInvoiced = 0
    let totalPaid = 0
    let rentRevenue = 0
    let waterRevenue = 0
    let outstandingAmount = 0

    const invoiceIds = orgInvoices.map((inv) => inv.id)
    let paymentMap = new Map<string, number>()
    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('invoice_id, amount_paid')
        .eq('verified', true)
        .in('invoice_id', invoiceIds)

      paymentMap = new Map()
      for (const payment of payments || []) {
        const key = payment.invoice_id
        const amountPaid = parseFloat(payment.amount_paid.toString())
        paymentMap.set(key, (paymentMap.get(key) || 0) + amountPaid)
      }
    }

    for (const invoice of orgInvoices) {
      const amount = parseFloat(invoice.amount.toString())
      totalInvoiced += amount

      if (invoice.invoice_type === 'rent') {
        rentRevenue += amount
      } else if (invoice.invoice_type === 'water') {
        waterRevenue += amount
      }

      const paidAmount = paymentMap.get(invoice.id) || 0
      const isPaid = invoiceStatusToBoolean(invoice.status) || paidAmount >= amount

      if (isPaid) {
        totalPaid += amount
      } else {
        totalPaid += paidAmount
        outstandingAmount += Math.max(amount - paidAmount, 0)
      }
    }

    const totalRevenue = rentRevenue + waterRevenue
    const collectionRate =
      totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0

    return {
      totalRevenue,
      rentRevenue,
      waterRevenue,
      outstandingAmount,
      collectionRate: Math.round(collectionRate * 100) / 100,
      totalInvoiced,
      totalPaid,
    }
  } catch (error) {
    console.error('Error calculating revenue metrics:', error)
    throw error
  }
}

/**
 * Calculate occupancy metrics for an organization
 */
export async function calculateOccupancyMetrics(
  organizationId: string
): Promise<OccupancyMetrics> {
  try {
    const supabase = await createClient()

    // Get all units for the organization
    const { data: units } = await supabase
      .from('apartment_units')
      .select(
        `
        id,
        status,
        building_id,
        apartment_buildings (
          organization_id
        )
      `
      )

    if (!units || units.length === 0) {
      return {
        totalUnits: 0,
        occupiedUnits: 0,
        vacantUnits: 0,
        maintenanceUnits: 0,
        occupancyRate: 0,
        vacancyRate: 0,
      }
    }

    // Filter units for this organization
    const orgUnits = units.filter((unit) => {
      const building = unit.apartment_buildings as any
      return building?.organization_id === organizationId
    })

    const totalUnits = orgUnits.length
    const occupiedUnits = orgUnits.filter((u) => u.status === 'occupied').length
    const vacantUnits = orgUnits.filter((u) => u.status === 'vacant').length
    const maintenanceUnits = orgUnits.filter(
      (u) => u.status === 'maintenance'
    ).length

    const occupancyRate =
      totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0
    const vacancyRate = totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : 0

    return {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      maintenanceUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      vacancyRate: Math.round(vacancyRate * 100) / 100,
    }
  } catch (error) {
    console.error('Error calculating occupancy metrics:', error)
    throw error
  }
}

/**
 * Calculate payment metrics for a date range
 */
export async function calculatePaymentMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<PaymentMetrics> {
  try {
    const supabase = await createClient()

    // Get all payments for invoices in the organization
    const { data: payments } = await supabase
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_date,
        verified,
        invoice_id,
        invoices (
          due_date,
          status,
          lease_id,
          leases (
            unit_id,
            apartment_units (
              building_id,
              apartment_buildings (
                organization_id
              )
            )
          )
        )
      `
      )
      .gte('payment_date', startDate.toISOString())
      .lte('payment_date', endDate.toISOString())
      .eq('verified', true)

    if (!payments || payments.length === 0) {
      return {
        totalPayments: 0,
        onTimePayments: 0,
        latePayments: 0,
        averagePaymentDelay: 0,
        paymentReliability: 0,
      }
    }

    // Filter payments for this organization
    const orgPayments = payments.filter((payment) => {
      const invoice = payment.invoices as any
      const lease = invoice?.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any
      return building?.organization_id === organizationId
    })

    let onTimePayments = 0
    let latePayments = 0
    let totalDelayDays = 0
    let delayedPaymentsCount = 0

    for (const payment of orgPayments) {
      const invoice = payment.invoices as any
      const dueDate = new Date(invoice.due_date)
      const paymentDate = new Date(payment.payment_date)

      if (paymentDate <= dueDate) {
        onTimePayments++
      } else {
        latePayments++
        const delayDays = Math.ceil(
          (paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        totalDelayDays += delayDays
        delayedPaymentsCount++
      }
    }

    const totalPayments = orgPayments.length
    const averagePaymentDelay =
      delayedPaymentsCount > 0
        ? totalDelayDays / delayedPaymentsCount
        : 0
    const paymentReliability =
      totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 0

    return {
      totalPayments,
      onTimePayments,
      latePayments,
      averagePaymentDelay: Math.round(averagePaymentDelay * 100) / 100,
      paymentReliability: Math.round(paymentReliability * 100) / 100,
    }
  } catch (error) {
    console.error('Error calculating payment metrics:', error)
    throw error
  }
}

/**
 * Calculate water usage metrics for a date range
 */
export async function calculateWaterUsageMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<WaterUsageMetrics> {
  try {
    const supabase = await createClient()

    // Get all water bills for the organization
    const { data: waterBills } = await supabase
      .from('water_bills')
      .select(
        `
        id,
        amount,
        units_consumed,
        unit_id,
        apartment_units (
          building_id,
          apartment_buildings (
            organization_id
          )
        )
      `
      )
      .gte('billing_month', startDate.toISOString().split('T')[0])
      .lte('billing_month', endDate.toISOString().split('T')[0])

    if (!waterBills || waterBills.length === 0) {
      return {
        totalWaterBills: 0,
        totalWaterAmount: 0,
        averageUsagePerUnit: 0,
        unitsWithBills: 0,
      }
    }

    // Filter water bills for this organization
    const orgWaterBills = waterBills.filter((bill) => {
      const unit = bill.apartment_units as any
      const building = unit?.apartment_buildings as any
      return building?.organization_id === organizationId
    })

    const totalWaterBills = orgWaterBills.length
    const totalWaterAmount = orgWaterBills.reduce(
      (sum, bill) => sum + parseFloat(bill.amount.toString()),
      0
    )

    // Get unique units with bills
    const uniqueUnits = new Set(
      orgWaterBills.map((bill) => bill.unit_id)
    ).size

    const totalUsage = orgWaterBills.reduce(
      (sum, bill) =>
        sum + (bill.units_consumed ? parseFloat(bill.units_consumed.toString()) : 0),
      0
    )
    const averageUsagePerUnit =
      uniqueUnits > 0 ? totalUsage / uniqueUnits : 0

    return {
      totalWaterBills,
      totalWaterAmount,
      averageUsagePerUnit: Math.round(averageUsagePerUnit * 100) / 100,
      unitsWithBills: uniqueUnits,
    }
  } catch (error) {
    console.error('Error calculating water usage metrics:', error)
    throw error
  }
}

/**
 * Calculate tenant reliability scores
 */
export async function calculateTenantReliability(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<TenantReliability[]> {
  try {
    const supabase = await createClient()

    // Build date filter
    let invoiceQuery = supabase
      .from('invoices')
      .select(
        `
        id,
        status,
        due_date,
        payment_date,
        lease_id,
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

    if (startDate) {
      invoiceQuery = invoiceQuery.gte('created_at', startDate.toISOString())
    }
    if (endDate) {
      invoiceQuery = invoiceQuery.lte('created_at', endDate.toISOString())
    }

    const { data: invoices } = await invoiceQuery

    if (!invoices || invoices.length === 0) {
      return []
    }

    // Filter invoices for this organization
    const orgInvoices = invoices.filter((inv) => {
      const lease = inv.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any
      return building?.organization_id === organizationId
    })

    // Group by tenant
    const tenantMap = new Map<
      string,
      {
        tenantId: string
        tenantName: string
        unitNumber: string
        invoices: any[]
      }
    >()

    for (const invoice of orgInvoices) {
      const lease = invoice.leases as any
      const tenantId = lease?.tenant_user_id
      const unit = lease?.apartment_units as any
      const unitNumber = unit?.unit_number || 'Unknown'

      if (!tenantId) continue

      if (!tenantMap.has(tenantId)) {
        // Get tenant name
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', tenantId)
          .single()

        tenantMap.set(tenantId, {
          tenantId,
          tenantName: (profile?.full_name as string) || 'Unknown',
          unitNumber,
          invoices: [],
        })
      }

      tenantMap.get(tenantId)!.invoices.push(invoice)
    }

    // Calculate reliability for each tenant
    const reliabilityScores: TenantReliability[] = []

    for (const [tenantId, data] of tenantMap.entries()) {
      const invoices = data.invoices
      const totalInvoices = invoices.length
      let paidInvoices = 0
      let latePayments = 0
      let onTimePayments = 0
      let totalDelayDays = 0
      let delayedPaymentsCount = 0

      for (const invoice of invoices) {
        if (invoiceStatusToBoolean(invoice.status)) {
          paidInvoices++

          if (invoice.payment_date && invoice.due_date) {
            const dueDate = new Date(invoice.due_date)
            const paymentDate = new Date(invoice.payment_date)

            if (paymentDate > dueDate) {
              latePayments++
              const delayDays = Math.ceil(
                (paymentDate.getTime() - dueDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              )
              totalDelayDays += delayDays
              delayedPaymentsCount++
            } else {
              onTimePayments++
            }
          }
        }
      }

      const reliabilityScore =
        totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0
      const averageDelayDays =
        delayedPaymentsCount > 0
          ? totalDelayDays / delayedPaymentsCount
          : 0

      reliabilityScores.push({
        tenantId,
        tenantName: data.tenantName,
        unitNumber: data.unitNumber,
        totalInvoices,
        paidInvoices,
        latePayments,
        onTimePayments,
        reliabilityScore: Math.round(reliabilityScore * 100) / 100,
        averageDelayDays: Math.round(averageDelayDays * 100) / 100,
      })
    }

    // Sort by reliability score (descending)
    return reliabilityScores.sort((a, b) => b.reliabilityScore - a.reliabilityScore)
  } catch (error) {
    console.error('Error calculating tenant reliability:', error)
    throw error
  }
}

/**
 * Calculate monthly breakdown of revenue
 */
export async function calculateMonthlyRevenue(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<
  Array<{
    month: string
    rent: number
    water: number
    total: number
    paid: number
    outstanding: number
  }>
> {
  try {
    const supabase = await createClient()

    // Get all invoices grouped by month
    const { data: invoices } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_type,
        amount,
        status,
        payment_date,
        created_at,
        leases (
          unit_id,
          apartment_units (
            building_id,
            apartment_buildings (
              organization_id
            )
          )
        )
      `
      )
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (!invoices || invoices.length === 0) {
      return []
    }

    const invoiceIds = invoices.map((inv) => inv.id)
    let paymentMap = new Map<string, number>()
    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('invoice_id, amount_paid')
        .eq('verified', true)
        .in('invoice_id', invoiceIds)

      paymentMap = new Map()
      for (const payment of payments || []) {
        const key = payment.invoice_id
        const amountPaid = parseFloat(payment.amount_paid.toString())
        paymentMap.set(key, (paymentMap.get(key) || 0) + amountPaid)
      }
    }

    // Filter and group by month
    const monthlyData = new Map<
      string,
      {
        rent: number
        water: number
        paid: number
        outstanding: number
      }
    >()

    for (const invoice of invoices) {
      const lease = invoice.leases as any
      const unit = lease?.apartment_units as any
      const building = unit?.apartment_buildings as any

      if (building?.organization_id !== organizationId) continue

      const date = new Date(invoice.created_at)
      const month = date.getMonth() + 1
      const monthKey = `${date.getFullYear()}-${month < 10 ? '0' : ''}${month}`

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, {
          rent: 0,
          water: 0,
          paid: 0,
          outstanding: 0,
        })
      }

      const data = monthlyData.get(monthKey)!
      const amount = parseFloat(invoice.amount.toString())

      if (invoice.invoice_type === 'rent') {
        data.rent += amount
      } else if (invoice.invoice_type === 'water') {
        data.water += amount
      }

      const paidAmount = paymentMap.get(invoice.id) || 0
      const invoicePaid = invoiceStatusToBoolean(invoice.status) || paidAmount >= amount

      if (invoicePaid) {
        data.paid += amount
      } else {
        data.paid += paidAmount
        data.outstanding += Math.max(amount - paidAmount, 0)
      }
    }

    // Convert to array and format
    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        rent: Math.round(data.rent * 100) / 100,
        water: Math.round(data.water * 100) / 100,
        total: Math.round((data.rent + data.water) * 100) / 100,
        paid: Math.round(data.paid * 100) / 100,
        outstanding: Math.round(data.outstanding * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
  } catch (error) {
    console.error('Error calculating monthly revenue:', error)
    throw error
  }
}
