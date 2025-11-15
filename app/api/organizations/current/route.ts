import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Get the current user's organization
 * Returns the organization data for the authenticated user
 * 
 * Architecture:
 * - organization_members: Junction table for affiliation/linking only
 *   - Used to identify which organization a user belongs to (organization_id)
 *   - Used to identify the user's role in that organization (admin, manager, caretaker, tenant)
 *   - Does NOT contain member data (that comes from user_profiles, auth.users, etc.)
 * - organizations: Contains organization data (name, logo, location, etc.)
 * - user_profiles: Contains member profile data (full_name, phone, address, etc.)
 */
export async function GET(request: NextRequest) {
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

    // Get organization_id and role from organization_members (junction table)
    // This table is ONLY for affiliation/linking - identifying which org the user belongs to and their role
    // Member data (name, email, phone) comes from user_profiles or auth.users, not this table
    // Use admin client to bypass RLS and avoid infinite recursion in RLS policies
    const adminSupabase = createAdminClient()
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membershipError) {
      console.error('Error fetching organization membership:', membershipError)
      return NextResponse.json(
        {
          success: false,
          error: membershipError.message || 'Failed to fetch organization membership',
        },
        { status: 500 }
      )
    }

    if (!membership || !membership.organization_id) {
      console.log(`No organization membership found for user: ${user.id}`)
      return NextResponse.json(
        {
          success: false,
          error: 'No organization found for this user',
        },
        { status: 404 }
      )
    }

    // Fetch organization data directly from organizations table
    // Use regular client to respect RLS policies for organization data
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single()

    if (orgError || !organization) {
      console.error('Error fetching organization:', orgError)
      return NextResponse.json(
        {
          success: false,
          error: orgError?.message || 'Organization not found',
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...organization,
          user_role: membership.role,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Get current organization error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

