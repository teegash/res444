import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and password are required',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // Handle specific error cases
      let errorMessage = error.message
      
      // If email not confirmed, provide helpful message
      if (error.message.includes('email not confirmed') || error.message.includes('Email not confirmed')) {
        errorMessage = 'Please verify your email address before logging in. Check your inbox for the verification link.'
      }
      
      // If invalid credentials, provide generic message (security)
      if (error.message.includes('Invalid login credentials') || error.message.includes('invalid')) {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.'
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 401 }
      )
    }

    if (!data.session || !data.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create session',
        },
        { status: 401 }
      )
    }

    const userId = data.user.id
    const userMetadata = data.user.user_metadata || {}
    const userRoleFromMetadata = userMetadata.role as string | undefined

    // Get user's role from organization_members
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let userRole = membership?.role || userRoleFromMetadata || null

    // If no membership exists but user has role in metadata, try to create profile/member
    if (!membership && userRoleFromMetadata) {
      console.log('No membership found, attempting to create profile/member on login...')
      
      try {
        // Import the createProfileOnLogin function
        const { createProfileOnLogin } = await import('@/lib/auth/create-profile-on-login')
        
        // Get organization_id from metadata (for managers/caretakers)
        const organizationId = userMetadata.organization_id as string | undefined
        
        // Create profile and/or organization member if needed
        const createResult = await createProfileOnLogin(
          userId,
          {
            full_name: userMetadata.full_name as string | undefined,
            phone: userMetadata.phone as string | undefined,
            role: userRoleFromMetadata,
            building_id: userMetadata.building_id as string | undefined,
          },
          organizationId
        )

        if (createResult.memberCreated || createResult.profileCreated) {
          console.log('✓ Profile/member created on login:', {
            profileCreated: createResult.profileCreated,
            memberCreated: createResult.memberCreated,
          })

          // Retry getting membership after creation
          const { data: newMembership } = await supabase
            .from('organization_members')
            .select('role, organization_id')
            .eq('user_id', userId)
            .maybeSingle()

          if (newMembership) {
            userRole = newMembership.role
            console.log('✓ Membership found after creation:', userRole)
          } else {
            // If still no membership, use role from metadata
            // This is fine for admins who need to set up organization first
            userRole = userRoleFromMetadata
            console.log('⚠ No membership after creation, using metadata role:', userRole)
          }
        } else {
          // Creation failed, but use role from metadata anyway
          // Admins can login without membership (they'll be redirected to setup)
          userRole = userRoleFromMetadata
          console.log('⚠ Profile/member creation failed, using metadata role:', userRole)
        }
      } catch (createError: any) {
        console.error('Error creating profile/member on login:', createError)
        // Use role from metadata anyway - admins can login without membership
        userRole = userRoleFromMetadata
      }
    }

    // For admins: Allow login even without membership (they'll set up organization)
    // For managers/caretakers: They should have organization_id in metadata
    // If no role at all, return error
    if (!userRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'User role not found. Please contact support.',
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: userId,
        has_membership: !!membership,
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Sign in error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

