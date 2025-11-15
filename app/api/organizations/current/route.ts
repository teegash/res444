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
    console.log('Membership data from HTTP request:', JSON.stringify(membershipData, null, 2))
    const membership = Array.isArray(membershipData) && membershipData.length > 0 ? membershipData[0] : null

    let organizationId: string | null = null
    let userRole: string | null = null

    if (membership && membership.organization_id) {
      // Found membership record - use it
      organizationId = membership.organization_id
      userRole = membership.role
      console.log(`✓ Found membership: org_id=${organizationId}, role=${userRole}`)
    } else {
      // No membership found - try comprehensive fallback strategies
      console.log(`⚠ No membership found for user: ${user.id} (email: ${user.email})`)
      console.log('Attempting fallback strategies...')
      
      // Strategy 1: Get user role from user_profiles or metadata
      let userRoleFromProfile: string | null = null
      try {
        const profileResponse = await fetchWithTimeout(
          `${supabaseUrl}/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
          1000,
          'User role lookup'
        )
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          userRoleFromProfile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0]?.role : null
        }
      } catch (err) {
        console.warn('Failed to get role from profile:', err)
      }
      
      const userRoleFromMetadata = user.user_metadata?.role || null
      const detectedRole = userRoleFromProfile || userRoleFromMetadata || 'admin'
      console.log(`Detected user role: ${detectedRole} (from profile: ${userRoleFromProfile}, from metadata: ${userRoleFromMetadata})`)

      // Strategy 2: For admins, try to find organization by email (exact match)
      if (detectedRole === 'admin' && user.email) {
        console.log(`Strategy 2: Searching for organization by email: ${user.email}`)
        try {
          const orgResponse = await fetchWithTimeout(
            `${supabaseUrl}/rest/v1/organizations?email=eq.${encodeURIComponent(user.email.toLowerCase())}&select=id,name,email&limit=1`,
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
            'Organization lookup by email'
          )

          if (orgResponse.ok) {
            const orgData = await orgResponse.json()
            console.log('Organization lookup by email result:', JSON.stringify(orgData, null, 2))
            if (Array.isArray(orgData) && orgData.length > 0 && orgData[0].id) {
              organizationId = orgData[0].id
              userRole = 'admin'
              console.log(`✓ Found organization via email match: ${orgData[0].id} (${orgData[0].name})`)
            }
          }
        } catch (err) {
          console.warn('Strategy 2 failed:', err)
        }
      }

      // Strategy 3: If still not found and admin, check all organizations (might be created with different email)
      if (!organizationId && detectedRole === 'admin') {
        console.log(`Strategy 3: Searching all organizations for user ${user.id}`)
        try {
          // Get all organizations and see if any match the user
          const allOrgsResponse = await fetchWithTimeout(
            `${supabaseUrl}/rest/v1/organizations?select=id,name,email&limit=100`,
            {
              method: 'GET',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
            },
            3000,
            'All organizations lookup'
          )

          if (allOrgsResponse.ok) {
            const allOrgs = await allOrgsResponse.json()
            console.log(`Found ${Array.isArray(allOrgs) ? allOrgs.length : 0} total organizations`)
            
            // Try to match by email (case-insensitive)
            if (user.email && Array.isArray(allOrgs)) {
              const matchedOrg = allOrgs.find((org: any) => 
                org.email && org.email.toLowerCase() === user.email!.toLowerCase()
              )
              
              if (matchedOrg && matchedOrg.id) {
                organizationId = matchedOrg.id
                userRole = 'admin'
                console.log(`✓ Found organization via email search: ${organizationId} (${matchedOrg.name})`)
              } else if (allOrgs.length > 0) {
                // Last resort: if only one org exists and user is admin, assign it
                // This handles edge cases where email doesn't match exactly
                if (allOrgs.length === 1) {
                  organizationId = allOrgs[0].id
                  userRole = 'admin'
                  console.log(`✓ Assigned single organization to admin user: ${organizationId}`)
                }
              }
            }
          }
        } catch (err) {
          console.warn('Strategy 3 failed:', err)
        }
      }

      // If we found an organization but no membership, create it
      if (organizationId && !membership) {
        console.log(`Creating missing membership record for org: ${organizationId}, role: ${userRole || detectedRole}`)
        try {
          const createMembershipResponse = await fetchWithTimeout(
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
                role: userRole || detectedRole || 'admin',
                joined_at: new Date().toISOString(),
              }),
            },
            2000,
            'Membership creation'
          )

          if (createMembershipResponse.ok) {
            console.log('✓ Successfully created missing membership record')
          } else {
            const errorText = await createMembershipResponse.text()
            console.warn('Failed to create membership record:', createMembershipResponse.status, errorText)
            // Continue anyway - membership might already exist or constraint violation is ok
          }
        } catch (err) {
          // Non-blocking - continue even if membership creation fails
          console.warn('Exception creating membership record (non-blocking):', err)
        }
      }

      if (!organizationId) {
        console.error(`✗ All fallback strategies failed. No organization found for user: ${user.id}`)
        console.error(`User email: ${user.email}, Role: ${detectedRole}`)
        return NextResponse.json(
          {
            success: false,
            error: 'No organization found for this user. Please create or join an organization.',
            details: {
              user_id: user.id,
              email: user.email,
              detected_role: detectedRole,
            },
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

