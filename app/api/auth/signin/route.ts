import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { Database } from '@/lib/supabase/database.types'

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

    console.log('Starting sign in for:', email)
    
    // Try admin client first - it's faster (no cookies), same pattern as registration
    // If that fails, fall back to server client
    console.log('Creating Supabase admin client for signin...')
    const clientStartTime = Date.now()
    
    // Use admin client for signin - same approach as registration (which works)
    // Admin client doesn't use cookies() so it's much faster
    const supabase = createAdminClient()
    
    const clientTime = Date.now() - clientStartTime
    console.log(`Supabase admin client created in ${clientTime}ms`)
    
    // Sign in with password with timeout
    // Vercel limit is 10s, so we use 6s timeout to be safe and get faster feedback
    console.log('Calling signInWithPassword...')
    const startTime = Date.now()
    
    let data: any
    let error: any
    
    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      // 6 second timeout - faster feedback if it's hanging
      // Same approach as registration which works
      const signInTimeout = new Promise((_, reject) => 
        setTimeout(() => {
          const elapsed = Date.now() - startTime
          reject(new Error(`Sign in timed out after ${elapsed}ms (6s limit)`))
        }, 6000)
      )
      
      console.log('Waiting for signInWithPassword to complete (timeout: 6s)...')
      const result = await Promise.race([signInPromise, signInTimeout]) as any
      const elapsed = Date.now() - startTime
      
      data = result.data
      error = result.error
      
      console.log(`Sign in completed in ${elapsed}ms - Success:`, !!data?.session, 'Error:', !!error)
      
      if (error) {
        console.error('Supabase signin error:', {
          message: error.message,
          status: error.status,
          name: error.name,
        })
      }
    } catch (signInError: any) {
      const elapsed = Date.now() - startTime
      console.error(`Sign in failed after ${elapsed}ms:`, signInError.message)
      console.error('Sign in error details:', {
        name: signInError.name,
        message: signInError.message,
        stack: signInError.stack?.substring(0, 500), // Limit stack trace
      })
      
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
          error: signInError.message || 'Failed to sign in. Please try again.',
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

    // Admin client doesn't set cookies automatically, so return session data
    // Client will set cookies using the session tokens
    const response = NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: userId,
        session: data.session, // Include session for client to set cookies
      },
      { status: 200 }
    )

    return response
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

