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

    // Get user's role from user_profiles (much simpler and more reliable!)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    let userRole = profile?.role || userRoleFromMetadata || null

    // If profile exists but role is missing, update it from metadata
    if (profile && !profile.role && userRoleFromMetadata) {
      console.log('Profile exists but role is missing, updating from metadata...')
      try {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ role: userRoleFromMetadata })
          .eq('id', userId)

        if (!updateError) {
          userRole = userRoleFromMetadata
          console.log('✓ Role updated in profile:', userRole)
        } else {
          console.warn('⚠ Failed to update role in profile:', updateError.message)
        }
      } catch (updateError: any) {
        console.warn('⚠ Error updating role in profile:', updateError.message)
      }
    }

    // If no profile exists, create it (shouldn't happen if trigger is working, but handle it)
    if (!profile && userRoleFromMetadata) {
      console.log('Profile not found, creating profile with role...')
      try {
        const { createProfileOnLogin } = await import('@/lib/auth/create-profile-on-login')
        const organizationId = userMetadata.organization_id as string | undefined
        
        await createProfileOnLogin(
          userId,
          {
            full_name: userMetadata.full_name as string | undefined,
            phone: userMetadata.phone as string | undefined,
            role: userRoleFromMetadata,
            building_id: userMetadata.building_id as string | undefined,
          },
          organizationId
        )

        // Retry getting profile after creation
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()

        if (newProfile?.role) {
          userRole = newProfile.role
          console.log('✓ Profile created with role:', userRole)
        } else {
          userRole = userRoleFromMetadata
          console.log('⚠ Profile created but role missing, using metadata:', userRole)
        }
      } catch (createError: any) {
        console.error('Error creating profile on login:', createError)
        userRole = userRoleFromMetadata
      }
    }

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

