import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const rawCode = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!rawCode) {
      return NextResponse.json({ success: false, error: 'Access code is required.' }, { status: 400 })
    }

    const { data: record, error } = await admin
      .from('invite_codes')
      .select('id, code, expires_at, max_uses, used_count, active')
      .eq('code', rawCode)
      .maybeSingle()

    if (error) {
      console.error('[InviteCode] Fetch error', error)
      return NextResponse.json({ success: false, error: 'Unable to validate code.' }, { status: 500 })
    }

    if (!record) {
      return NextResponse.json({ success: false, error: 'Invalid access code.' }, { status: 400 })
    }

    const now = new Date()
    const expiresAt = record.expires_at ? new Date(record.expires_at) : null
    const usageExceeded = record.used_count >= record.max_uses

    if (!record.active || !expiresAt || expiresAt < now || usageExceeded) {
      return NextResponse.json({ success: false, error: 'Access code is expired or inactive.' }, { status: 400 })
    }

    const newUsedCount = (record.used_count || 0) + 1
    const deactivate = newUsedCount >= record.max_uses

    const { error: updateError } = await admin
      .from('invite_codes')
      .update({
        used_count: newUsedCount,
        active: deactivate ? false : record.active,
      })
      .eq('id', record.id)

    if (updateError) {
      console.error('[InviteCode] Update error', updateError)
      return NextResponse.json({ success: false, error: 'Failed to update code usage.' }, { status: 500 })
    }

    const res = NextResponse.json({ success: true, message: 'Access granted. Continue to sign up.' })
    res.cookies.set({
      name: 'invite_access',
      value: record.id,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour
    })
    return res
  } catch (error) {
    console.error('[InviteCode] Validation failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to validate access code.' },
      { status: 500 }
    )
  }
}
