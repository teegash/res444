import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Get the current user's organization
 * Returns the organization data for the authenticated user
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

    // Get user's organization membership
    const { data: membership, error: membershipError } = await supabase
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

    if (!membership) {
      console.log(`No organization membership found for user: ${user.id}`)
      return NextResponse.json(
        {
          success: false,
          error: 'No organization found for this user',
        },
        { status: 404 }
      )
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single()

    if (orgError || !organization) {
      return NextResponse.json(
        {
          success: false,
          error: 'Organization not found',
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

