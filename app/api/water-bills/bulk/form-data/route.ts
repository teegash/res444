import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const propertyId = url.searchParams.get('propertyId')

    if (!propertyId) {
      return NextResponse.json(
        { success: false, error: 'propertyId is required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[WaterBillBulkFormData] membership lookup failed', membershipError)
      return NextResponse.json(
        { success: false, error: 'Unable to verify organization.' },
        { status: 500 }
      )
    }

    const orgId = membership?.organization_id
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const { data: building, error: buildingError } = await adminSupabase
      .from('apartment_buildings')
      .select('id, name, location')
      .eq('organization_id', orgId)
      .eq('id', propertyId)
      .maybeSingle()

    if (buildingError) throw buildingError
    if (!building) {
      return NextResponse.json({ success: false, error: 'Property not found.' }, { status: 404 })
    }

    const { data: units, error: unitsError } = await adminSupabase
      .from('apartment_units')
      .select('id, unit_number, status, building_id')
      .eq('organization_id', orgId)
      .eq('building_id', propertyId)

    if (unitsError) throw unitsError

    const unitIds = (units || []).map((u) => u.id)
    if (!unitIds.length) {
      return NextResponse.json({
        success: true,
        data: { property: building, rows: [], default_rate: 85 },
      })
    }

    const { data: leases, error: leasesError } = await adminSupabase
      .from('leases')
      .select('id, tenant_user_id, unit_id, status, start_date')
      .eq('organization_id', orgId)
      .in('status', ['active', 'pending'])
      .in('unit_id', unitIds)
      .order('start_date', { ascending: false })

    if (leasesError) throw leasesError

    const leaseByUnit = new Map<string, { id: string; tenant_user_id: string }>()
    for (const lease of leases || []) {
      if (!lease.tenant_user_id) continue
      if (!leaseByUnit.has(lease.unit_id)) {
        leaseByUnit.set(lease.unit_id, {
          id: lease.id,
          tenant_user_id: lease.tenant_user_id,
        })
      }
    }

    const billableUnits = (units || []).filter((unit) => leaseByUnit.has(unit.id))
    const billableUnitIds = billableUnits.map((u) => u.id)

    if (!billableUnitIds.length) {
      return NextResponse.json({
        success: true,
        data: { property: building, rows: [], default_rate: 85 },
      })
    }

    const tenantIds = Array.from(leaseByUnit.values()).map((l) => l.tenant_user_id)

    let tenants: Array<{ id: string; full_name: string | null; phone_number: string | null }> = []
    if (tenantIds.length) {
      const { data: tenantData, error: tenantsError } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .eq('role', 'tenant')
        .in('id', tenantIds)

      if (tenantsError) throw tenantsError
      tenants = tenantData || []
    }

    const tenantMap = new Map((tenants || []).map((t) => [t.id, t]))

    const tenantEmailMap = new Map<string, string>()
    if (tenantIds.length) {
      await Promise.all(
        tenantIds.map(async (tid) => {
          try {
            const { data } = await adminSupabase.auth.admin.getUserById(tid)
            if (data?.user?.email) {
              tenantEmailMap.set(tid, data.user.email)
            }
          } catch (err) {
            console.warn('[WaterBillBulkFormData] tenant email fetch failed', tid, err)
          }
        })
      )
    }

    const { data: readings, error: readingsError } = await adminSupabase
      .from('water_bills')
      .select('unit_id, meter_reading_end, billing_month')
      .eq('organization_id', orgId)
      .in('unit_id', billableUnitIds)
      .order('billing_month', { ascending: false })

    if (readingsError) throw readingsError

    const latestReadingByUnit = new Map<string, number>()
    for (const reading of readings || []) {
      if (!latestReadingByUnit.has(reading.unit_id) && reading.meter_reading_end !== null) {
        latestReadingByUnit.set(reading.unit_id, Number(reading.meter_reading_end))
      }
    }

    const rows = billableUnits.map((unit) => {
      const lease = leaseByUnit.get(unit.id)
      const tenant = lease?.tenant_user_id ? tenantMap.get(lease.tenant_user_id) : null

      return {
        unit_id: unit.id,
        unit_number: unit.unit_number,
        tenant_user_id: tenant?.id || null,
        tenant_name: tenant?.full_name || null,
        tenant_phone: tenant?.phone_number || null,
        tenant_email: tenant ? tenantEmailMap.get(tenant.id) || null : null,
        latest_reading: latestReadingByUnit.get(unit.id) ?? null,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        property: building,
        rows,
        default_rate: 85,
      },
    })
  } catch (error) {
    console.error('[WaterBillBulkFormData] Failed', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load bulk billing data.',
      },
      { status: 500 }
    )
  }
}
