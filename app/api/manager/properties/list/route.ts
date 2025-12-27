import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('apartment_buildings')
      .select('id, name, location')
      .eq('organization_id', membership.organization_id)
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('[manager/properties/list] error', error)
    return NextResponse.json({ success: false, error: 'Failed to load properties.' }, { status: 500 })
  }
}
