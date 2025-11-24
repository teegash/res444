import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email } = body || {}
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') + '/auth/callback?redirect=/dashboard/settings'

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Settings.Password.Reset.POST] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to start password reset.' }, { status: 500 })
  }
}
