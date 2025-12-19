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

    const organizationId = userRole.organization_id
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('vw_lease_prepayment_status')
      .select(
        'organization_id, lease_id, tenant_user_id, tenant_name, tenant_phone, unit_id, unit_number, rent_paid_until, next_rent_due_date, is_prepaid'
      )
      .eq('organization_id', organizationId)
      .order('rent_paid_until', { ascending: false })
      .limit(500)

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    console.error('[Finance.Prepayments.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch prepayments' },
      { status: 500 }
    )
  }
}
