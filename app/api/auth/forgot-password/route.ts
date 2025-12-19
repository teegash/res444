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
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    const siteUrl = configuredSiteUrl || request.nextUrl.origin

    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // Use the auth callback for PKCE exchange, then land on the reset form.
      redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
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
