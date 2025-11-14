import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Get list of all organizations (public endpoint for registration)
 * This allows managers and caretakers to see available organizations during signup
 * Uses admin client to bypass RLS for registration purposes
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    // Get all organizations (for registration purposes, we show all)
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, name, email, phone, location')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching organizations:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch organizations',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: organizations || [],
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Organizations list error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

