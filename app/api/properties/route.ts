import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. Please sign in.',
        },
        { status: 401 }
      )
    }

    const adminSupabase = createAdminClient()

    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership?.organization_id) {
      return NextResponse.json({ success: true, data: [] })
    }

    const { data: buildings, error: buildingError } = await adminSupabase
      .from('apartment_buildings')
      .select(
        `
          id,
          name,
          location,
          total_units,
          description,
          image_url,
          created_at,
          apartment_units!apartment_units_building_id_fkey ( status )
        `
      )
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })

    if (buildingError) {
      throw buildingError
    }

    const formatted = (buildings || []).map((building) => {
      const units = Array.isArray(building.apartment_units) ? building.apartment_units : []
      const occupiedUnits = units.filter((unit) => unit.status === 'occupied').length

      return {
        id: building.id,
        name: building.name,
        location: building.location,
        totalUnits: building.total_units,
        occupiedUnits,
        description: building.description,
        imageUrl: building.image_url,
      }
    })

    return NextResponse.json({ success: true, data: formatted })
  } catch (error) {
    const err = error as Error
    console.error('Failed to fetch properties:', err)
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unable to load properties.',
      },
      { status: 500 }
    )
  }
}
