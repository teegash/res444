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
    console.log('Membership data from HTTP request:', membershipData)
    const membership = Array.isArray(membershipData) && membershipData.length > 0 ? membershipData[0] : null

    let organizationId: string | null = null
    let userRole: string | null = null

    if (membership && membership.organization_id) {
      // Found membership record - use it
      organizationId = membership.organization_id
      userRole = membership.role
      console.log(`Found membership: org_id=${organizationId}, role=${userRole}`)
    } else {
      // No membership found - try fallback: check if user is admin and owns an organization directly
      // This handles cases where organization was created but membership record failed
      console.log(`No membership found for user: ${user.id}, checking for direct ownership...`)
      
      const userRoleFromMetadata = user.user_metadata?.role || null
      if (userRoleFromMetadata === 'admin') {
        // For admins, try to find organization by email
        const orgResponse = await fetchWithTimeout(
          `${supabaseUrl}/rest/v1/organizations?email=eq.${encodeURIComponent(user.email || '')}&select=id&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
          2000,
          'Organization fallback lookup'
        )

        if (orgResponse.ok) {
          const orgData = await orgResponse.json()
          if (Array.isArray(orgData) && orgData.length > 0) {
            organizationId = orgData[0].id
            userRole = 'admin'
            console.log(`Found organization via fallback: ${organizationId}`)
            
            // Try to create membership record (non-blocking)
            try {
              await fetchWithTimeout(
                `${supabaseUrl}/rest/v1/organization_members`,
                {
                  method: 'POST',
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                  },
                  body: JSON.stringify({
                    user_id: user.id,
                    organization_id: organizationId,
                    role: 'admin',
                    joined_at: new Date().toISOString(),
                  }),
                },
                1000,
                'Membership creation (fallback)'
              )
              console.log('Created missing membership record')
            } catch (err) {
              // Non-blocking - continue even if membership creation fails
              console.warn('Failed to create membership record (non-blocking):', err)
            }
          }
        }
      }

      if (!organizationId) {
        console.log(`No organization found for user: ${user.id}`)
        return NextResponse.json(
          {
            success: false,
            error: 'No organization found for this user',
          },
          { status: 404 }
        )
      }
    }

    // Fetch organization data directly from organizations table
    // Use regular client to respect RLS policies for organization data
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId!)
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
          user_role: userRole || 'admin',
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

