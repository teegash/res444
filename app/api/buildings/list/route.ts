import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get list of buildings/apartments for a specific organization
 * Used during caretaker registration to select which building they'll manage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'organization_id is required',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get all buildings for the specified organization
    const { data: buildings, error } = await supabase
      .from('apartment_buildings')
      .select('id, name, location, total_units, organization_id')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching buildings:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch buildings',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: buildings || [],
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Buildings list error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

