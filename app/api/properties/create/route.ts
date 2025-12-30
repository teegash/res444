import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface UnitPayload {
  unit_number: string
  floor?: number | null
  number_of_bedrooms?: number | null
  number_of_bathrooms?: number | null
  size_sqft?: number | null
  status?: 'vacant' | 'occupied' | 'maintenance'
}

export async function POST(request: NextRequest) {
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
          error: 'Unauthorized. Please sign in to continue.',
        },
        { status: 401 }
      )
    }

    const adminSupabase = createAdminClient()

    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Organization not found. Please create an organization first.',
        },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      name,
      location,
      total_units,
      description,
      units,
      image_url,
      image_file,
      vacancy_alerts_enabled,
    }: {
      name: string
      location: string
      total_units: number
      description?: string | null
      units?: UnitPayload[]
      image_url?: string | null
      image_file?: string | null
      vacancy_alerts_enabled?: boolean
    } = body

    if (!name || !location || !total_units || Number.isNaN(Number(total_units))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Property name, location, and total units are required.',
        },
        { status: 400 }
      )
    }

    let finalImageUrl = image_url?.trim() || null

    if (image_file) {
      try {
        const supabase = await createClient()
        const fileBuffer = Buffer.from(image_file, 'base64')
        const fileName = `properties/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('profile-pictures')
          .upload(fileName, fileBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        const { data: publicUrlData } = supabase.storage
          .from('profile-pictures')
          .getPublicUrl(fileName)

        finalImageUrl = publicUrlData.publicUrl
      } catch (uploadErr) {
        console.error('Inline image upload failed:', uploadErr)
      }
    }

    const { data: building, error: buildingError } = await adminSupabase
      .from('apartment_buildings')
      .insert({
        organization_id: membership.organization_id,
        name: name.trim(),
        location: location.trim(),
        total_units: Number(total_units),
        description: description?.trim() || null,
        image_url: finalImageUrl,
        vacancy_alerts_enabled: Boolean(vacancy_alerts_enabled),
      })
      .select()
      .single()

    if (buildingError || !building) {
      return NextResponse.json(
        {
          success: false,
          error: buildingError?.message || 'Failed to create property.',
        },
        { status: 500 }
      )
    }

    let insertedUnits: UnitPayload[] | null = null

    if (Array.isArray(units) && units.length > 0) {
      const sanitizedUnits = units
        .filter((unit) => unit.unit_number && unit.unit_number.trim().length > 0)
        .map((unit) => ({
          building_id: building.id,
          unit_number: unit.unit_number.trim(),
          floor:
            unit.floor === undefined || unit.floor === null || unit.floor === ''
              ? null
              : Number(unit.floor),
          number_of_bedrooms:
            unit.number_of_bedrooms === undefined ||
            unit.number_of_bedrooms === null ||
            unit.number_of_bedrooms === ''
              ? null
              : Number(unit.number_of_bedrooms),
          number_of_bathrooms:
            unit.number_of_bathrooms === undefined ||
            unit.number_of_bathrooms === null ||
            unit.number_of_bathrooms === ''
              ? null
              : Number(unit.number_of_bathrooms),
          size_sqft:
            unit.size_sqft === undefined ||
            unit.size_sqft === null ||
            unit.size_sqft === ''
              ? null
              : Number(unit.size_sqft),
          status: unit.status || 'vacant',
        }))

      if (sanitizedUnits.length > 0) {
        const { data: createdUnits, error: unitsError } = await adminSupabase
          .from('apartment_units')
          .insert(sanitizedUnits)
          .select('unit_number, floor, number_of_bedrooms, number_of_bathrooms, size_sqft, status')

        if (unitsError) {
          return NextResponse.json(
            {
              success: false,
              error: unitsError.message || 'Failed to create units.',
            },
            { status: 500 }
          )
        }

        insertedUnits = createdUnits as UnitPayload[]

        const bulkGroupId = crypto.randomUUID()

        await adminSupabase.from('bulk_unit_creation_logs').insert({
          building_id: building.id,
          bulk_group_id: bulkGroupId,
          created_by: user.id,
          units_created: sanitizedUnits.length,
          units_data: sanitizedUnits,
        })
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Property created successfully.',
        data: {
          building_id: building.id,
          units_created: insertedUnits?.length || 0,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Property creation error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred.',
      },
      { status: 500 }
    )
  }
}
