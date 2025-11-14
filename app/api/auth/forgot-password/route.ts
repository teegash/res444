import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email is required',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // We don't reveal if email exists or not for security reasons
    // Always return success message even if email doesn't exist
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${siteUrl}/auth/reset-password`,
    })

    // Always return success to prevent email enumeration
    // Supabase will only send email if the account exists, but we don't reveal that
    return NextResponse.json(
      {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent. Please check your inbox.',
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Forgot password error:', err)

    // Still return success to prevent email enumeration
    return NextResponse.json(
      {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent. Please check your inbox.',
      },
      { status: 200 }
    )
  }
}

