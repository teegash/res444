import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const adminSupabase = createAdminClient()

    const { data: buildings, error: buildingError } = await adminSupabase
      .from('apartment_buildings')
      .select('id, name, location')
      .order('name', { ascending: true })

    if (buildingError) throw buildingError

    const { data: units, error: unitsError } = await adminSupabase
      .from('apartment_units')
      .select('id, unit_number, status, building_id')

    if (unitsError) throw unitsError

    const { data: leases, error: leasesError } = await adminSupabase
      .from('leases')
      .select('id, tenant_user_id, unit_id, status')
      .in('status', ['active', 'pending'])

    if (leasesError) throw leasesError

    const { data: tenants, error: tenantsError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, address')
      .eq('role', 'tenant')

    if (tenantsError) throw tenantsError

    const tenantEmailMap = new Map<string, string>()
    if (tenants?.length) {
      await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const { data } = await adminSupabase.auth.admin.getUserById(tenant.id)
            if (data?.user?.email) {
              tenantEmailMap.set(tenant.id, data.user.email)
            }
          } catch (err) {
            console.warn('[WaterBillFormData] Failed to fetch tenant email', tenant.id, err)
          }
        })
      )
    }

    const { data: readings, error: readingsError } = await adminSupabase
      .from('water_bills')
      .select('unit_id, meter_reading_end, billing_month')
      .order('billing_month', { ascending: false })

    if (readingsError) throw readingsError

    const readingMap = new Map<string, number>()
    readings?.forEach((reading) => {
      if (!readingMap.has(reading.unit_id) && reading.meter_reading_end !== null) {
        readingMap.set(reading.unit_id, Number(reading.meter_reading_end))
      }
    })

    const tenantMap = new Map((tenants || []).map((tenant) => [tenant.id, tenant]))
    const leaseMap = new Map<string, { tenant_user_id: string | null; status: string | null }>()
    leases?.forEach((lease) => {
      if (!leaseMap.has(lease.unit_id)) {
        leaseMap.set(lease.unit_id, {
          tenant_user_id: lease.tenant_user_id,
          status: lease.status,
        })
      }
    })

    const properties = (buildings || []).map((building) => ({
      id: building.id,
      name: building.name,
      location: building.location,
      units:
        units
          ?.filter((unit) => unit.building_id === building.id)
          .map((unit) => {
            const lease = leaseMap.get(unit.id)
            const tenant = lease?.tenant_user_id ? tenantMap.get(lease.tenant_user_id) : null
            return {
              id: unit.id,
              unit_number: unit.unit_number,
              status: unit.status,
              tenant: tenant
                ? {
                    id: tenant.id,
                    name: tenant.full_name,
                    phone: tenant.phone_number,
                    email: tenantEmailMap.get(tenant.id) || null,
                  }
                : null,
              latest_reading: readingMap.get(unit.id) ?? null,
            }
          }) || [],
    }))

    return NextResponse.json({
      success: true,
      data: {
        properties,
        default_rate: 85,
      },
    })
  } catch (error) {
    console.error('[WaterBillFormData] Failed to load water bill metadata', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load data.',
      },
      { status: 500 }
    )
  }
}
