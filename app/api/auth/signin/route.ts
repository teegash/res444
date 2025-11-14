import { NextRequest, NextResponse } from 'next/server'

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

async function fetchUserRoleFromProfiles(userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  try {
    const response = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=role&limit=1`,
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
      1000,
      'Role lookup'
    )

    if (!response.ok) {
      return null
    }

    const result = await response.json()
    return result?.[0]?.role || null
  } catch (error) {
    console.warn('Role lookup failed:', (error as Error).message)
    return null
  }
}

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
    const startTime = Date.now()

    try {
      const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`
      console.log('Calling Supabase auth API directly with 5s timeout...')
      const response = await fetchWithTimeout(
        authUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            email,
            password,
          }),
        },
        5000,
        'Sign in'
      )

      const elapsed = Date.now() - startTime
      const result = await response.json()

      if (!response.ok) {
        error = result
      } else {
        data = result
      }

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

    // Fallback to profile table via REST (service role) with strict timeout
    if (!userRole) {
      userRole = await fetchUserRoleFromProfiles(userId)
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
