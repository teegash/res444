import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId, role } = await requireAuth()

    if (role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const userRole = await getUserRole(userId)
    const admin = createAdminClient()
    let organizationId = userRole?.organization_id || null

    if (!organizationId) {
      const { data: membership } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()
      organizationId = membership?.organization_id || null
    }

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: 'User not associated with an organization' },
        { status: 403 }
      )
    }

    const { data, error } = await admin
      .from('vw_tenant_arrears')
      .select('organization_id, tenant_user_id, arrears_amount, open_invoices_count, oldest_due_date')
      .eq('organization_id', organizationId)
      .eq('tenant_user_id', userId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? null })
  } catch (error) {
    console.error('[Tenant.Arrears.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch arrears' },
      { status: 500 }
    )
  }
}
