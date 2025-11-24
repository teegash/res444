import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['manager', 'caretaker']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email, full_name, role, password } = body || {}

    if (!email || !full_name || !role || !password || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Email, full name, password, and valid role are required.' },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found for user.' }, { status: 400 })
    }

    const orgId = membership.organization_id
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    })
    if (createError) throw createError
    if (!newUser?.user?.id) {
      return NextResponse.json({ success: false, error: 'Failed to create user.' }, { status: 500 })
    }

    const userId = newUser.user.id

    // upsert profile
    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert({ id: userId, full_name, role })
    if (profileError) throw profileError

    const { error: memberError } = await admin
      .from('organization_members')
      .insert({ user_id: userId, organization_id: orgId, role })
    if (memberError) throw memberError

    // Ideally send an email via your notification system; for now return success
    return NextResponse.json({
      success: true,
      data: { user_id: userId },
      message: 'Team member invited successfully.',
    })
  } catch (error) {
    console.error('[Settings.Team.Invite.POST] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to invite team member.' }, { status: 500 })
  }
}
