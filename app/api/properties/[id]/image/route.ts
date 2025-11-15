import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
        { success: false, error: 'Organization not found.' },
        { status: 403 }
      ),
    }
  }

  const { data: building, error: buildingError } = await adminSupabase
    .from('apartment_buildings')
    .select('id, organization_id')
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

  return { adminSupabase, building }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authContext = await authorize(params.id)
  if ('error' in authContext && authContext.error) return authContext.error

  const { adminSupabase, building } = authContext
  const body = await request.json()
  const imageUrl = typeof body?.image_url === 'string' ? body.image_url.trim() : ''

  if (!imageUrl) {
    return NextResponse.json(
      { success: false, error: 'image_url is required.' },
      { status: 400 }
    )
  }

  const { error } = await adminSupabase
    .from('apartment_buildings')
    .update({ image_url: imageUrl })
    .eq('id', building.id)

  if (error) {
    console.error('Failed to update building image:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update property image.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
