import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const canCreate = await hasPermission(userId, 'tenant:create')
    if (!canCreate) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: membership, error: mErr } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (mErr || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('apartment_buildings')
      .select('id, name, location, total_units')
      .eq('organization_id', membership.organization_id)
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] }, { status: 200 })
  } catch (e) {
    console.error('[tenants/properties/list] error', e)
    return NextResponse.json({ success: false, error: 'Failed to load properties' }, { status: 500 })
  }
}
