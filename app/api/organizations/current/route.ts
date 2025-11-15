import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

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

    // Get organization_id and role from organization_members using direct HTTP request
    // This bypasses RLS completely and avoids infinite recursion in RLS policies
    // organization_members is ONLY for affiliation/linking - identifying which org the user belongs to and their role
    // Member data (name, email, phone) comes from user_profiles or auth.users, not this table
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error',
        },
        { status: 500 }
      )
    }

    // Direct HTTP request to Supabase REST API with service role key to bypass RLS
    const membershipResponse = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/organization_members?user_id=eq.${user.id}&select=organization_id,role&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      },
      2000,
      'Organization membership lookup'
    )

    if (!membershipResponse.ok) {
      console.error('Error fetching organization membership:', membershipResponse.status, membershipResponse.statusText)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch organization membership',
        },
        { status: 500 }
      )
    }

    const membershipData = await membershipResponse.json()
    const membership = Array.isArray(membershipData) && membershipData.length > 0 ? membershipData[0] : null

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

