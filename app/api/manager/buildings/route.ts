import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId, role } = await requireAuth()
    if (role !== 'manager' && role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const userRole = await getUserRole(userId)
    if (!userRole?.organization_id) {
      const admin = createAdminClient()
      const { data: membership } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()
      userRole.organization_id = membership?.organization_id || null
    }

    if (!userRole?.organization_id) {
      return NextResponse.json(
        { success: false, error: 'User not associated with an organization' },
        { status: 403 }
      )
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('apartment_buildings')
      .select('id, name, location')
      .eq('organization_id', userRole.organization_id)
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    console.error('[Manager.Buildings.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load buildings' },
      { status: 500 }
    )
  }
}
