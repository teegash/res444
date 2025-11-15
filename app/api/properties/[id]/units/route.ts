import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UNIT_STATUSES = ['vacant', 'occupied', 'maintenance'] as const

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

  const { data: membership, error: membershipError } = await adminSupabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Organization not found for this user.' },
        { status: 403 }
      ),
    }
  }

  const { data: building, error: buildingError } = await adminSupabase
    .from('apartment_buildings')
    .select('id, organization_id, name, location, total_units, description, image_url, created_at')
    .eq('id', buildingId)
    .maybeSingle()

  if (buildingError || !building) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Building not found.' },
        { status: 404 }
      ),
    }
  }

  if (building.organization_id !== membership.organization_id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Access denied for this building.' },
        { status: 403 }
      ),
    }
  }

  return {
    adminSupabase,
    building,
    organizationId: membership.organization_id,
    user,
  }
}

function sanitizeBuildingId(rawId: string | string[] | null | undefined) {
  const value = Array.isArray(rawId) ? rawId[0] : rawId
  return value ? decodeURIComponent(String(value)).trim() : ''
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url)
  const buildingId =
    sanitizeBuildingId(params.id) || sanitizeBuildingId(url.searchParams.get('buildingId'))
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building } = authContext

  const { data: units, error: unitsError } = await adminSupabase
    .from('apartment_units')
    .select('id, unit_number, floor, number_of_bedrooms, number_of_bathrooms, size_sqft, status, created_at')
    .eq('building_id', building.id)
    .order('unit_number')

  if (unitsError) {
    console.error('Failed to fetch units', unitsError)
    return NextResponse.json(
      {
        success: false,
        error: 'Unable to load units.',
      },
      { status: 500 }
    )
  }

  const { data: bulkLogs, error: logsError } = await adminSupabase
    .from('bulk_unit_creation_logs')
    .select('id, bulk_group_id, units_created, created_by, created_at')
    .eq('building_id', building.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (logsError) {
    console.error('Failed to fetch bulk logs', logsError)
  }

  return NextResponse.json({
    success: true,
    data: {
      building: {
        id: building.id,
        name: building.name,
        location: building.location,
        total_units: building.total_units,
        description: building.description,
        image_url: building.image_url,
        created_at: building.created_at,
      },
      units: units || [],
      bulk_logs: bulkLogs || [],
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const buildingId =
    sanitizeBuildingId(params.id) ||
    sanitizeBuildingId(url.searchParams.get('buildingId')) ||
    sanitizeBuildingId(body?.building_id)
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building, user } = authContext
  const units: any[] = Array.isArray(body.units) ? body.units : []

  if (units.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Please provide at least one unit.' },
      { status: 400 }
    )
  }

  const { count: existingCount, error: countError } = await adminSupabase
    .from('apartment_units')
    .select('id', { count: 'exact', head: true })
    .eq('building_id', building.id)

  if (countError) {
    console.error('Failed to count units', countError)
    return NextResponse.json(
      { success: false, error: 'Unable to verify available unit capacity.' },
      { status: 500 }
    )
  }

  const remainingCapacity = Math.max(0, building.total_units - (existingCount || 0))

  if (units.length > remainingCapacity) {
    return NextResponse.json(
      {
        success: false,
        error: `You can only add ${remainingCapacity} more unit${remainingCapacity === 1 ? '' : 's'}.`,
      },
      { status: 400 }
    )
  }

  const sanitizedUnits = units.map((unit) => ({
    building_id: building.id,
    unit_number: String(unit.unit_number || '').trim(),
    floor:
      unit.floor === undefined || unit.floor === null || unit.floor === ''
        ? null
        : Number(unit.floor),
    number_of_bedrooms:
      unit.number_of_bedrooms === undefined || unit.number_of_bedrooms === null || unit.number_of_bedrooms === ''
        ? null
        : Number(unit.number_of_bedrooms),
    number_of_bathrooms:
      unit.number_of_bathrooms === undefined || unit.number_of_bathrooms === null || unit.number_of_bathrooms === ''
        ? null
        : Number(unit.number_of_bathrooms),
    size_sqft:
      unit.size_sqft === undefined || unit.size_sqft === null || unit.size_sqft === ''
        ? null
        : Number(unit.size_sqft),
    status: UNIT_STATUSES.includes(unit.status) ? unit.status : 'vacant',
  }))

  if (sanitizedUnits.some((unit) => !unit.unit_number)) {
    return NextResponse.json(
      { success: false, error: 'Unit number is required for each unit.' },
      { status: 400 }
    )
  }

  const { data: createdUnits, error: insertError } = await adminSupabase
    .from('apartment_units')
    .insert(sanitizedUnits)
    .select('id, unit_number, floor, number_of_bedrooms, number_of_bathrooms, size_sqft, status')

  if (insertError) {
    console.error('Failed to add units', insertError)
    return NextResponse.json(
      { success: false, error: insertError.message || 'Failed to add units.' },
      { status: 500 }
    )
  }

  const bulkGroupId = crypto.randomUUID()
  await adminSupabase.from('bulk_unit_creation_logs').insert({
    building_id: building.id,
    bulk_group_id: bulkGroupId,
    created_by: user.id,
    units_created: sanitizedUnits.length,
    units_data: sanitizedUnits,
  })

  return NextResponse.json({
    success: true,
    data: createdUnits,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const buildingId =
    sanitizeBuildingId(params.id) ||
    sanitizeBuildingId(url.searchParams.get('buildingId')) ||
    sanitizeBuildingId(body?.building_id)
  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required.' }, { status: 400 })
  }

  const authContext = await authorize(buildingId)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building } = authContext
  const { unit_id, updates } = body || {}

  if (!unit_id || !updates) {
    return NextResponse.json(
      { success: false, error: 'unit_id and updates are required.' },
      { status: 400 }
    )
  }

  const allowed: Record<string, any> = {}
  if (typeof updates.unit_number === 'string') {
    allowed.unit_number = updates.unit_number.trim()
  }
  if (updates.floor !== undefined) {
    allowed.floor = updates.floor === '' ? null : Number(updates.floor)
  }
  if (updates.number_of_bedrooms !== undefined) {
    allowed.number_of_bedrooms = updates.number_of_bedrooms === '' ? null : Number(updates.number_of_bedrooms)
  }
  if (updates.number_of_bathrooms !== undefined) {
    allowed.number_of_bathrooms = updates.number_of_bathrooms === '' ? null : Number(updates.number_of_bathrooms)
  }
  if (updates.size_sqft !== undefined) {
    allowed.size_sqft = updates.size_sqft === '' ? null : Number(updates.size_sqft)
  }
  if (updates.status && UNIT_STATUSES.includes(updates.status)) {
    allowed.status = updates.status
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json(
      { success: false, error: 'No valid fields to update.' },
      { status: 400 }
    )
  }

  const { error: updateError } = await adminSupabase
    .from('apartment_units')
    .update(allowed)
    .eq('id', unit_id)
    .eq('building_id', building.id)

  if (updateError) {
    console.error('Failed to update unit', updateError)
    return NextResponse.json(
      { success: false, error: updateError.message || 'Failed to update unit.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
