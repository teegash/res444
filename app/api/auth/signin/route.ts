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

    console.log('Starting sign in for:', email)
    
    // Use direct HTTP request to Supabase auth API - fastest and most reliable
    // This avoids client creation overhead and cookie issues
    console.log('Calling Supabase auth API directly...')
    const startTime = Date.now()
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error. Please contact support.',
        },
        { status: 500 }
      )
    }

    let data: any
    let error: any
    
    try {
      // Direct HTTP request to Supabase auth API - fastest approach
      const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`
      
      const signInPromise = fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }).then(async (res) => {
        const result = await res.json()
        if (!res.ok) {
          return { data: null, error: result }
        }
        return { data: result, error: null }
      })
      
      // 6 second timeout - faster feedback if it's hanging
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
      
      console.log(`Sign in completed in ${elapsed}ms - Success:`, !!data?.access_token, 'Error:', !!error)
      
      if (error) {
        console.error('Supabase signin error:', {
          message: error.error_description || error.message,
          status: error.status,
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
      const errorMessage = error.error_description || error.message || 'Authentication failed'
      let userFriendlyMessage = errorMessage
      
      // If email not confirmed, provide helpful message
      if (errorMessage.includes('email not confirmed') || errorMessage.includes('Email not confirmed')) {
        userFriendlyMessage = 'Please verify your email address before logging in. Check your inbox for the verification link.'
      }
      
      // If invalid credentials, provide generic message (security)
      if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid') || errorMessage.includes('Invalid')) {
        userFriendlyMessage = 'Invalid email or password. Please check your credentials and try again.'
      }

      return NextResponse.json(
        {
          success: false,
          error: userFriendlyMessage,
        },
        { status: 401 }
      )
    }

    if (!data || !data.access_token || !data.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create session',
        },
        { status: 401 }
      )
    }

    const userId = data.user.id

    // Create session object from API response
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type,
      user: data.user,
    }

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
        const adminSupabase = createAdminClient()
        const profileQuery = adminSupabase
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

    // Return session data - client will set cookies using the session tokens
    const response = NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: userId,
        session: session, // Include session for client to set cookies
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

