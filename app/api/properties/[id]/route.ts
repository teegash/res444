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
  const { data: membership } = await adminSupabase
    .from('organization_members')
    .select('organization_id')
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

  return { adminSupabase, building }
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
