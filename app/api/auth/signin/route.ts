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

    // Get user's role from user_profiles (profile should be fully populated during registration)
    // Add timeout to prevent hanging - query should complete quickly
    let userRole: string | null = null
    
    try {
      const profileQuery = supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      
      const profileTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile query timed out after 3 seconds')), 3000)
      )
      
      const { data: profile, error: profileError } = await Promise.race([
        profileQuery,
        profileTimeout
      ]) as any
      
      if (profileError && !profileError.message.includes('timed out')) {
        console.warn('Profile query error (non-blocking):', profileError.message)
      }
      
      userRole = profile?.role || null
    } catch (queryError: any) {
      console.warn('Profile query failed (non-blocking):', queryError.message)
      // Continue with metadata fallback
    }

    // If profile query didn't return role, use metadata as fallback
    if (!userRole) {
      userRole = data.user.user_metadata?.role || null
    }

    if (!userRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'User role not found. Please contact support.',
        },
        { status: 403 }
      )
    }

    // Profile is already populated during registration, so login is just about getting role and redirecting
    console.log('✓ Login successful - role from profile:', userRole)

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

