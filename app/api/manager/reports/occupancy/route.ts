import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPeriodRange } from '../utils'

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'quarter'
    const propertyFilter = request.nextUrl.searchParams.get('property') || 'all'
    const { startDate, endDate } = getPeriodRange(period)

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id
    const { data: units, error: unitsError } = await admin
      .from('apartment_units')
      .select('id, building_id, apartment_buildings ( id, name, location )')
      .eq('organization_id', orgId)

    if (unitsError) throw unitsError

    const { data: leases, error: leasesError } = await admin
      .from('leases')
      .select('id, status, start_date, end_date, unit:apartment_units ( id, building_id )')
      .in('status', ['active', 'pending'])
      .eq('organization_id', orgId)

    if (leasesError) throw leasesError

    const buildingTotals = new Map<
      string,
      { name: string; location: string | null; units: number; occupied: number; moveIns: number; moveOuts: number }
    >()

    units?.forEach((unit) => {
      const building = unit.apartment_buildings
      if (!building?.id) return
      if (!buildingTotals.has(building.id)) {
        buildingTotals.set(building.id, {
          name: building.name || 'Property',
          location: building.location || null,
          units: 0,
          occupied: 0,
          moveIns: 0,
          moveOuts: 0,
        })
      }
      const entry = buildingTotals.get(building.id)!
      entry.units += 1
    })

    const startTime = startDate ? new Date(startDate).getTime() : null
    const endTime = endDate ? new Date(endDate).getTime() : null

    leases?.forEach((lease) => {
      const buildingId = lease.unit?.building_id
      if (!buildingId) return
      const entry = buildingTotals.get(buildingId)
      if (!entry) return
      entry.occupied += 1
      const start = lease.start_date ? new Date(lease.start_date).getTime() : null
      const end = lease.end_date ? new Date(lease.end_date).getTime() : null
      if (startTime && endTime && start && start >= startTime && start <= endTime) {
        entry.moveIns += 1
      }
      if (startTime && endTime && end && end >= startTime && end <= endTime) {
        entry.moveOuts += 1
      }
    })

    let rows = Array.from(buildingTotals.entries()).map(([id, entry]) => ({
      id,
      property: entry.name,
      location: entry.location,
      occupied: entry.occupied,
      total: entry.units,
      moveIns: entry.moveIns,
      moveOuts: entry.moveOuts,
    }))

    if (propertyFilter !== 'all') {
      rows = rows.filter((row) => row.property === propertyFilter || row.id === propertyFilter)
    }

    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    console.error('[Reports.Occupancy] Failed to load occupancy report', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load occupancy report.' },
      { status: 500 }
    )
  }
}
