import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

async function hasOrganizationMembership(userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return false
  }

  try {
    const response = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/organization_members?user_id=eq.${userId}&select=organization_id&limit=1`,
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
      'Organization membership lookup'
    )

    if (!response.ok) {
      return false
    }

    const result = await response.json()
    return Array.isArray(result) && result.length > 0 && !!result[0]?.organization_id
  } catch (error) {
    console.warn('Organization membership lookup failed:', (error as Error).message)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Expected JSON.' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email and password are required',
        },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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

    const responseCookies: {
      name: string
      value: string
      options?: Parameters<typeof NextResponse.prototype.cookies.set>[2]
    }[] = []

    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            responseCookies.push({ name, value, options })
          })
        },
      },
    })

    const signInPromise = supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sign in timed out after 4500ms')), 4500)
    )

    let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>
    try {
      signInResult = (await Promise.race([signInPromise, timeoutPromise])) as Awaited<
        ReturnType<typeof supabase.auth.signInWithPassword>
      >
    } catch (signInError: any) {
      console.error('Sign in failed:', signInError.message)
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

    const { data: authData, error: authError } = signInResult

    if (authError) {
      const errorMessage = authError.message || 'Authentication failed'
      let userFriendlyMessage = errorMessage

      if (errorMessage.toLowerCase().includes('email not confirmed')) {
        userFriendlyMessage =
          'Please verify your email address before logging in. Check your inbox for the verification link.'
      }

      if (errorMessage.toLowerCase().includes('invalid')) {
        userFriendlyMessage = 'Invalid email or password. Please check your credentials and try again.'
      }

      return NextResponse.json(
        {
          success: false,
          error: userFriendlyMessage,
        },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!authData.session || !authData.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create session',
        },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const userId = authData.user.id

    // Create session object from API response
    const session = {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      expires_at: authData.session.expires_at,
      token_type: authData.session.token_type,
      user: authData.user,
    }

    // Login should be FAST - just get role and return
    // Profile is created by trigger during registration, so it should exist
    // But we don't wait for it - use metadata as primary source for speed
    // Login completes in < 1 second this way
    
    // Try to get role from metadata first (fastest - no database query)
    let userRole: string | null = authData.user.user_metadata?.role || null

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

    let needsOrganizationSetup = false
    if (userRole === 'admin') {
      const membershipExists = await hasOrganizationMembership(userId)
      needsOrganizationSetup = !membershipExists
    }

    // Login successful - fast!
    console.log('✓ Login successful - role:', userRole, 'needsOrganizationSetup:', needsOrganizationSetup)

    // Return session data - client will set cookies using the session tokens
    const response = NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: userId,
        needsOrganizationSetup,
        session: session, // Include session for client to set cookies
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    responseCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. Use POST.' },
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  )
}
