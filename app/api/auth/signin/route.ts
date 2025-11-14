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
      return NextResponse.json(
        {
          success: false,
          error: error.message,
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

    // Get user's role from organization_members
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', data.user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const userRole = membership?.role || data.user.user_metadata?.role || null

    return NextResponse.json(
      {
        success: true,
        role: userRole,
        user_id: data.user.id,
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

