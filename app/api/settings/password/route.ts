import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/rbac/userRole'

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = await getUserRole(user.id)
    if (role?.role === 'tenant') {
      return NextResponse.json(
        { success: false, error: 'Tenants can only change passwords via password reset.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { newPassword } = body || {}
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      )
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Settings.Password.PUT] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to update password.' }, { status: 500 })
  }
}
