import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, access_token, refresh_token, token_hash, token, email } = body

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password is required',
        },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must be at least 8 characters long',
        },
        { status: 400 }
      )
    }

    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must contain at least one uppercase letter',
        },
        { status: 400 }
      )
    }

    if (!/\d/.test(password)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must contain at least one number',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    if (access_token) {
      if (!refresh_token) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid reset token. Please use the link from your email.',
          },
          { status: 400 }
        )
      }

      // Set the session using tokens from the email link (implicit recovery flow).
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      })

      if (sessionError || !sessionData.session) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid or expired reset token. Please request a new password reset.',
          },
          { status: 401 }
        )
      }
    } else if (token_hash) {
      // Some Supabase deployments send token_hash for recovery. Redeem it here (only on submit).
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash,
      })

      if (verifyError || !verified?.session) {
        return NextResponse.json(
          {
            success: false,
            error: verifyError?.message || 'Invalid or expired reset link. Please request a new password reset.',
          },
          { status: 401 }
        )
      }

      // Ensure the session is active for subsequent auth calls in this request.
      await supabase.auth.setSession({
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      })
    } else if (token && email) {
      // Legacy recovery format: token + email
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token,
        email,
      })

      if (verifyError || !verified?.session) {
        return NextResponse.json(
          {
            success: false,
            error: verifyError?.message || 'Invalid or expired reset link. Please request a new password reset.',
          },
          { status: 401 }
        )
      }

      // Ensure the session is active for subsequent auth calls in this request.
      await supabase.auth.setSession({
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      })
    } else {
      // Some deployments use a code->session exchange (PKCE) and rely on session cookies.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid or expired reset link. Please request a new password reset.',
          },
          { status: 401 }
        )
      }
    }

    // Update the password now that we have a valid session
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: updateError.message || 'Failed to update password',
        },
        { status: 500 }
      )
    }

    // Sign out the user after password reset (they'll need to login with new password)
    await supabase.auth.signOut()

    return NextResponse.json(
      {
        success: true,
        message: 'Password reset successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Reset password error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
