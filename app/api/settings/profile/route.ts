import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/rbac/userRole'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: { id: user.id, email: user.email, full_name: data?.full_name || '', phone_number: data?.phone_number || '' },
    })
  } catch (error) {
    console.error('[Settings.Profile.GET] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to load profile.' }, { status: 500 })
  }
}

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
        { success: false, error: 'Tenants cannot edit profile details.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { full_name, phone_number } = body || {}

    const admin = createAdminClient()
    const { error } = await admin
      .from('user_profiles')
      .update({ full_name: full_name || null, phone_number: phone_number || null })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Settings.Profile.PUT] failed', error)
    return NextResponse.json({ success: false, error: 'Failed to update profile.' }, { status: 500 })
  }
}
