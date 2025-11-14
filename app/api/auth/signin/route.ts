import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // Use admin client to avoid cookies() which can hang in serverless functions
    // Vercel has 10 second limit - signin should complete in < 3 seconds
    console.log('Starting sign in for:', email)
    
    const supabase = createAdminClient()
    
    // Sign in with password with timeout
    // Vercel limit is 10s, so we use 3s timeout to be safe
    let data: any
    let error: any
    
    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      // 3 second timeout - should be plenty for signin
      const signInTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timed out after 3 seconds')), 3000)
      )
      
      const result = await Promise.race([signInPromise, signInTimeout]) as any
      data = result.data
      error = result.error
      
      console.log('Sign in result - Success:', !!data?.session, 'Error:', !!error)
    } catch (signInError: any) {
      console.error('Sign in error:', signInError.message)
      if (signInError.message.includes('timed out')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Sign in timed out. Please check your connection and try again.',
          },
          { status: 504 }
        )
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to sign in. Please try again.',
        },
        { status: 500 }
      )
    }

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

    // Login should be FAST - just get role and return
    // Profile is created by trigger during registration, so it should exist
    // But we don't wait for it - use metadata as primary source for speed
    // Login completes in < 1 second this way
    
    // Try to get role from metadata first (fastest - no database query)
    let userRole: string | null = data.user.user_metadata?.role || null
    
    // Optionally try profile query with very short timeout (non-blocking)
    // Only if metadata doesn't have role
    if (!userRole) {
      try {
        const profileQuery = supabase
          .from('user_profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()
        
        // Very short timeout - 1 second max (login should be fast!)
        const profileTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile query timed out')), 1000)
        )
        
        const { data: profile } = await Promise.race([
          profileQuery,
          profileTimeout
        ]) as any
        
        userRole = profile?.role || null
      } catch (queryError: any) {
        // Profile query failed or timed out - use metadata
        // Don't log or wait - just continue
      }
    }

    // If still no role, that's a problem
    if (!userRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'User role not found. Please contact support.',
        },
        { status: 403 }
      )
    }

    // Login successful - fast!
    console.log('✓ Login successful - role:', userRole)

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

