import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function sanitizeBuildingId(rawId: string | string[] | null | undefined) {
  const value = Array.isArray(rawId) ? rawId[0] : rawId
  return value ? decodeURIComponent(String(value)).trim() : ''
}

async function authorize(buildingId: string) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminSupabase = createAdminClient()
  if (!adminSupabase) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Server configuration error (missing admin client).' },
        { status: 500 }
      ),
    }
  }
  const { data: membership } = await adminSupabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership?.organization_id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Organization not found for this user.' },
        { status: 403 }
      ),
    }
  }

  const { data: building, error: buildingError } = await adminSupabase
    .from('apartment_buildings')
    .select('id, organization_id, name, location, total_units, description, image_url, created_at, updated_at')
    .eq('id', buildingId)
    .maybeSingle()

  if (buildingError || !building) {
    return {
      error: NextResponse.json({ success: false, error: 'Building not found.' }, { status: 404 }),
    }
  }

  if (building.organization_id !== membership.organization_id) {
    return {
      error: NextResponse.json({ success: false, error: 'Access denied for this building.' }, { status: 403 }),
    }
  }

  return { adminSupabase, building, membership }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  const queryId = url.searchParams.get('buildingId')
  const buildingId = sanitizeBuildingId(params.id) || sanitizeBuildingId(queryId)
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building } = authContext

  const { count: totalUnitsCount, error: totalCountError } = await adminSupabase
    .from('apartment_units')
    .select('id', { head: true, count: 'exact' })
    .eq('building_id', building.id)

  const { count: occupiedUnitsCount, error: occupiedCountError } = await adminSupabase
    .from('apartment_units')
    .select('id', { head: true, count: 'exact' })
    .eq('building_id', building.id)
    .eq('status', 'occupied')

  if (totalCountError) {
    console.error('[GET /api/properties/[id]] Failed to count units', totalCountError)
  }
  if (occupiedCountError) {
    console.error('[GET /api/properties/[id]] Failed to count occupied units', occupiedCountError)
  }

  return NextResponse.json({
    success: true,
    data: {
      id: building.id,
      name: building.name,
      location: building.location,
      totalUnits: building.total_units,
      occupiedUnits: occupiedUnitsCount || 0,
      description: building.description,
      imageUrl: building.image_url,
      organizationId: building.organization_id,
      county: null,
      createdAt: building.created_at,
      updatedAt: building.updated_at,
      recordedUnits: totalUnitsCount || 0,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  const queryId = url.searchParams.get('buildingId')
  const body = await request.json().catch(() => ({}))
  const buildingId =
    sanitizeBuildingId(params.id) ||
    sanitizeBuildingId(queryId) ||
    sanitizeBuildingId(body?.building_id)
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building } = authContext
  const updates: Record<string, any> = {}

  if (typeof body.name === 'string') {
    updates.name = body.name.trim()
  }
  if (typeof body.location === 'string') {
    updates.location = body.location.trim()
  }
  if (typeof body.description === 'string') {
    updates.description = body.description.trim()
  }
  if (typeof body.image_url === 'string') {
    updates.image_url = body.image_url.trim() || null
  }
  if (body.total_units !== undefined) {
    const total = Number(body.total_units)
    if (!Number.isNaN(total) && total >= 0) {
      updates.total_units = total
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: 'No valid fields provided for update.' },
      { status: 400 }
    )
  }

  updates.updated_at = new Date().toISOString()

  const { error } = await adminSupabase
    .from('apartment_buildings')
    .update(updates)
    .eq('id', building.id)

  if (error) {
    console.error('[PATCH /api/properties/[id]] Update failed', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update property.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  const queryId = url.searchParams.get('buildingId')
  const buildingId = sanitizeBuildingId(params.id) || sanitizeBuildingId(queryId)
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building, membership } = authContext

  const role = String(membership?.role || '').toLowerCase()
  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { data: units, error: unitErr } = await adminSupabase
      .from('apartment_units')
      .select('id')
      .eq('building_id', building.id)
      .eq('organization_id', building.organization_id)

    if (unitErr) throw unitErr

    const unitIds = (units || []).map((u) => u.id).filter(Boolean) as string[]

    const tenantIds = new Set<string>()
    if (unitIds.length) {
      const { data: leases, error: leasesErr } = await adminSupabase
        .from('leases')
        .select('tenant_user_id')
        .in('unit_id', unitIds)
        .eq('organization_id', building.organization_id)

      if (leasesErr) throw leasesErr
      for (const lease of leases || []) {
        if (lease?.tenant_user_id) tenantIds.add(String(lease.tenant_user_id))
      }

      // Pre-delete water bills to avoid FK blocks when invoices are cascaded.
      const { error: waterErr } = await adminSupabase
        .from('water_bills')
        .delete()
        .in('unit_id', unitIds)
        .eq('organization_id', building.organization_id)
      if (waterErr) throw waterErr
    }

    // Delete the building (cascades: units -> leases -> invoices -> payments/audit, plus expenses/maintenance/etc.)
    const { error: delBuildingErr } = await adminSupabase
      .from('apartment_buildings')
      .delete()
      .eq('id', building.id)
      .eq('organization_id', building.organization_id)

    if (delBuildingErr) throw delBuildingErr

    // Cleanup tenant auth users that no longer have leases after the building deletion.
    let deletedTenants = 0
    const skippedTenants: string[] = []

    for (const tenantId of tenantIds) {
      const { data: profile, error: profileErr } = await adminSupabase
        .from('user_profiles')
        .select('role')
        .eq('id', tenantId)
        .maybeSingle()
      if (profileErr) {
        console.warn('[DELETE /api/properties/[id]] tenant profile lookup failed', profileErr)
        skippedTenants.push(tenantId)
        continue
      }

      if (String(profile?.role || '').toLowerCase() !== 'tenant') {
        skippedTenants.push(tenantId)
        continue
      }

      const { data: remainingLease } = await adminSupabase
        .from('leases')
        .select('id')
        .eq('tenant_user_id', tenantId)
        .limit(1)
        .maybeSingle()

      if (remainingLease?.id) {
        skippedTenants.push(tenantId)
        continue
      }

      const { error: authDelErr } = await adminSupabase.auth.admin.deleteUser(tenantId)
      if (authDelErr && authDelErr.status !== 404) {
        console.warn('[DELETE /api/properties/[id]] auth delete failed', tenantId, authDelErr)
        skippedTenants.push(tenantId)
        continue
      }
      deletedTenants += 1
    }

    return NextResponse.json({
      success: true,
      data: {
        building_id: building.id,
        deleted_tenants: deletedTenants,
        skipped_tenants: skippedTenants.length,
      },
    })
  } catch (error) {
    console.error('[DELETE /api/properties/[id]] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete property.' },
      { status: 500 }
    )
  }
}
