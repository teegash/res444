import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. Please sign in.',
        },
        { status: 401 }
      )
    }

    // Get userId from query params or use authenticated user
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get('userId')

    // Users can only fetch their own profile
    const userId = requestedUserId || user.id
    if (userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. You can only fetch your own profile.',
        },
        { status: 403 }
      )
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, phone_number, role')
      .eq('id', userId)
      .single()

    if (profileError) {
      // Profile might not exist yet - return null gracefully
      if (profileError.code === 'PGRST116') {
        return NextResponse.json(
          {
            success: true,
            data: null,
          },
          { status: 200 }
        )
      }

      console.error('Error fetching user profile:', profileError)
      return NextResponse.json(
        {
          success: false,
          error: profileError.message || 'Failed to fetch user profile',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: profile,
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Get user profile error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

