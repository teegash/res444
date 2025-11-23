import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPeriodRange } from '../utils'

type PaymentRow = {
  amount_paid: number | null
  payment_date: string | null
  invoices: {
    lease_id: string | null
    leases: {
      unit: {
        building: {
          id: string
          name: string | null
          location: string | null
        } | null
      } | null
    } | null
  } | null
}

type LeaseRow = {
  id: string
  status: string | null
  monthly_rent: number | null
  unit: {
    id: string
    building: {
      id: string
      name: string | null
      location: string | null
    } | null
  } | null
}

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'quarter'
    const { startDate } = getPeriodRange(period)
    const admin = createAdminClient()

    const paymentsQuery = admin
      .from('payments')
      .select(
        `
        amount_paid,
        payment_date,
        invoices:invoice_id (
          lease_id,
          leases:lease_id (
            unit:apartment_units (
              building:apartment_buildings (
                id,
                name,
                location
              )
            )
          )
        )
      `
      )
      .order('payment_date', { ascending: false })

    if (startDate) {
      paymentsQuery.gte('payment_date', startDate)
    }

    const { data: payments, error: paymentsError } = await paymentsQuery

    if (paymentsError) {
      throw paymentsError
    }

    const leasesQuery = admin
      .from('leases')
      .select(
        `
        id,
        status,
        monthly_rent,
        unit:apartment_units (
          id,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .in('status', ['active', 'pending'])

    const { data: leases, error: leasesError } = await leasesQuery
    if (leasesError) {
      throw leasesError
    }

    const unitsQuery = admin.from('apartment_units').select('id, building_id')
    const { data: units, error: unitsError } = await unitsQuery
    if (unitsError) throw unitsError

    const buildingUnitTotals = new Map<string, number>()
    units?.forEach((unit) => {
      if (!unit.building_id) return
      buildingUnitTotals.set(unit.building_id, (buildingUnitTotals.get(unit.building_id) || 0) + 1)
    })

    let totalRevenue = 0
    const propertyRevenue = new Map<
      string,
      { name: string; location: string | null; amount: number; collectionRate: number }
    >()

    payments?.forEach((payment: PaymentRow) => {
      const amount = Number(payment.amount_paid || 0)
      totalRevenue += amount
      const building = payment.invoices?.leases?.unit?.building
      if (!building) return
      const current = propertyRevenue.get(building.id) || {
        name: building.name || 'Property',
        location: building.location,
        amount: 0,
        collectionRate: 0,
      }
      current.amount += amount
      propertyRevenue.set(building.id, current)
    })

    let totalOccupancy = 0
    let totalUnits = 0
    const propertyCollection = new Map<string, { collected: number; billed: number }>()

    leases?.forEach((lease: LeaseRow) => {
      const building = lease.unit?.building
      if (building?.id) {
        const unitsForBuilding = buildingUnitTotals.get(building.id) || 0
        if (unitsForBuilding > 0) {
          totalUnits += unitsForBuilding / (buildingUnitTotals.get(building.id) ? 1 : 1)
        }
        totalOccupancy += 1
      }
      const rent = Number(lease.monthly_rent || 0)
      if (building?.id) {
        const current = propertyCollection.get(building.id) || { collected: 0, billed: 0 }
        current.billed += rent
        propertyCollection.set(building.id, current)
      }
    })

    payments?.forEach((payment: PaymentRow) => {
      const building = payment.invoices?.leases?.unit?.building
      if (building?.id) {
        const current = propertyCollection.get(building.id) || { collected: 0, billed: 0 }
        current.collected += Number(payment.amount_paid || 0)
        propertyCollection.set(building.id, current)
      }
    })

    const occupancyRate = totalUnits === 0 ? 0 : (totalOccupancy / totalUnits) * 100
    const collectionRateTotals = Array.from(propertyCollection.values()).reduce(
      (acc, entry) => {
        acc.collected += entry.collected
        acc.billed += entry.billed
        return acc
      },
      { collected: 0, billed: 0 }
    )
    const collectionRate =
      collectionRateTotals.billed === 0
        ? 0
        : (collectionRateTotals.collected / collectionRateTotals.billed) * 100

    const avgRent =
      (leases || []).reduce((sum, l) => sum + Number(l.monthly_rent || 0), 0) /
      Math.max(1, leases?.length || 1)

    const propertyMetrics = Array.from(propertyRevenue.entries()).map(([id, entry]) => {
      const collect = propertyCollection.get(id) || { collected: 0, billed: 0 }
      const collectionPct = collect.billed === 0 ? 0 : (collect.collected / collect.billed) * 100
      return {
        id,
        name: entry.name,
        location: entry.location,
        revenue: entry.amount,
        collectionRate: collectionPct,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          revenue: totalRevenue,
          occupancyRate,
          collectionRate,
          avgRent,
        },
        properties: propertyMetrics,
      },
    })
  } catch (error) {
    console.error('[Reports.Summary] Failed to load summary', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load reports summary.' },
      { status: 500 }
    )
  }
}
