import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
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

    // Use admin client for organization creation to bypass RLS
    const adminSupabase = createAdminClient()

    const body = await request.json()
    const {
      name,
      email,
      phone,
      registration_number,
      location,
      description,
      county,
      address,
      postal_code,
      contact_person,
      bank_account,
      payment_methods,
      timezone,
      currency,
    } = body

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Organization name and email are required',
        },
        { status: 400 }
      )
    }

    // Check if user already has an organization membership
    const { data: existingMembership } = await adminSupabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (existingMembership) {
      return NextResponse.json(
        {
          success: false,
          error: 'You are already a member of an organization',
        },
        { status: 400 }
      )
    }

    // Get user's role from auth metadata (set during signup)
    const userRole = user.user_metadata?.role || 'admin'

    // Create organization with logo_url support using admin client
    const { data: organization, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        registration_number: registration_number?.trim() || null,
        location: location?.trim() || address?.trim() || null,
        logo_url: body.logo_url?.trim() || null, // Support logo URL from client upload
      })
      .select()
      .single()

    if (orgError) {
      // Handle duplicate registration number
      if (orgError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'Registration number already exists',
          },
          { status: 409 }
        )
      }

      console.error('Error creating organization:', orgError)
      return NextResponse.json(
        {
          success: false,
          error: orgError.message || 'Failed to create organization',
        },
        { status: 500 }
      )
    }

    if (!organization) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create organization',
        },
        { status: 500 }
      )
    }

    // Add user as organization member with their role using admin client
    const { error: memberError } = await adminSupabase
      .from('organization_members')
      .insert({
        user_id: user.id,
        organization_id: organization.id,
        role: userRole,
        joined_at: new Date().toISOString(),
      })

    if (memberError) {
      // If member creation fails, try to delete the organization
      await adminSupabase.from('organizations').delete().eq('id', organization.id)

      // Check if member already exists (shouldn't happen, but handle it)
      if (memberError.code === '23505') {
        return NextResponse.json(
          {
            success: true,
            message: 'Organization created successfully',
            data: {
              organization_id: organization.id,
            },
          },
          { status: 201 }
        )
      }

      console.error('Error creating organization member:', memberError)
      return NextResponse.json(
        {
          success: false,
          error: 'Organization created but failed to add you as a member',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Organization created successfully',
        data: {
          organization_id: organization.id,
          organization_name: organization.name,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Organization creation error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

