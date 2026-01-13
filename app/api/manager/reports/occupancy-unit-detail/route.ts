import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null) {
  return !!value && UUID_RE.test(value)
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const unitId = url.searchParams.get('unitId')
    if (!unitId || !isUuid(unitId)) {
      return NextResponse.json({ success: false, error: 'Valid unitId is required.' }, { status: 400 })
    }

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
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 })
    }

    const orgId = membership.organization_id

    const { data: unit, error: unitError } = await admin
      .from('apartment_units')
      .select(
        `
        id,
        unit_number,
        building:apartment_buildings!apartment_units_building_org_fk ( id, name, location )
      `
      )
      .eq('organization_id', orgId)
      .eq('id', unitId)
      .maybeSingle()

    if (unitError) throw unitError
    if (!unit) {
      return NextResponse.json({ success: false, error: 'Unit not found.' }, { status: 404 })
    }

    const { data: leases, error: leaseError } = await admin
      .from('leases')
      .select('id, tenant_user_id, start_date, end_date, status, created_at')
      .eq('organization_id', orgId)
      .eq('unit_id', unitId)
      .order('start_date', { ascending: false })

    if (leaseError) throw leaseError

    const leaseRows = leases || []
    const tenantIds = Array.from(
      new Set(leaseRows.map((row: any) => row.tenant_user_id).filter(Boolean))
    )

    let tenantMap = new Map<string, { full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length) {
      const { data: tenants, error: tenantsError } = await admin
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .in('id', tenantIds)
      if (tenantsError) throw tenantsError
      tenantMap = new Map((tenants || []).map((tenant: any) => [tenant.id, tenant] as any))
    }

    const leasePayload = leaseRows.map((row: any) => ({
      id: row.id,
      tenant_user_id: row.tenant_user_id,
      tenant_name: row.tenant_user_id ? tenantMap.get(row.tenant_user_id)?.full_name || null : null,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
    }))

    const leaseIds = leaseRows.map((row: any) => row.id).filter(Boolean)
    let notices: any[] = []
    if (leaseIds.length) {
      const { data: noticeRows, error: noticeError } = await admin
        .from('tenant_vacate_notices')
        .select('lease_id, requested_vacate_date, status, notice_submitted_at, created_at')
        .eq('organization_id', orgId)
        .in('lease_id', leaseIds)
        .order('created_at', { ascending: false })

      if (noticeError) throw noticeError
      notices = noticeRows || []
    }

    return NextResponse.json({
      success: true,
      unit,
      leases: leasePayload,
      notices,
    })
  } catch (error) {
    console.error('[Reports.Occupancy.UnitDetail] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load unit details.' },
      { status: 500 }
    )
  }
}
