import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
    
    // Use server client directly with request cookies to avoid cookies() hanging
    // This matches the proxy.ts pattern - fast and reliable
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

    // Create response object first (needed for cookie setting)
    let supabaseResponse = NextResponse.next({
      request,
    })

    // Create server client directly with request cookies (no async cookies() call)
    // This is the same pattern as proxy.ts - fast and doesn't hang
    const supabase = createServerClient<Database>(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies properly - this is how proxy.ts does it
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })
    
    // Sign in with password with timeout
    // Vercel limit is 10s, so we use 8s timeout to be safe
    console.log('Calling signInWithPassword...')
    const startTime = Date.now()
    
    let data: any
    let error: any
    
    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      // 8 second timeout - should be plenty for signin, well under Vercel's 10s limit
      const signInTimeout = new Promise((_, reject) => 
        setTimeout(() => {
          const elapsed = Date.now() - startTime
          reject(new Error(`Sign in timed out after ${elapsed}ms (8s limit)`))
        }, 8000)
      )
      
      console.log('Waiting for signInWithPassword to complete (timeout: 8s)...')
      const result = await Promise.race([signInPromise, signInTimeout]) as any
      const elapsed = Date.now() - startTime
      
      data = result.data
      error = result.error
      
      console.log(`Sign in completed in ${elapsed}ms - Success:`, !!data?.session, 'Error:', !!error)
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

    // Update supabaseResponse with JSON body - cookies are already set by Supabase SSR via setAll callback
    // This is how proxy.ts handles it - use the response that Supabase SSR created
    const response = NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: userId,
      },
      { status: 200 }
    )

    // Copy all cookies from supabaseResponse (set by Supabase SSR) to our JSON response
    // This ensures the session cookies are included in the response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      const existingCookie = supabaseResponse.cookies.get(cookie.name)
      if (existingCookie) {
        response.cookies.set(cookie.name, existingCookie.value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          ...(existingCookie.attributes || {}),
        })
      }
    })

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

