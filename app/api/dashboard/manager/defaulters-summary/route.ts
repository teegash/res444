import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStatementSummaryRows } from '@/lib/statements/summary'

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

    const { data: archivedRows, error: archivedErr } = await admin
      .from('tenant_archives')
      .select('tenant_user_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    if (archivedErr) {
      console.error('[Dashboard.DefaultersSummary.GET] Failed to load tenant archives', archivedErr)
    }

    const archivedTenantIds = new Set(
      (archivedRows || []).map((row: any) => row.tenant_user_id).filter(Boolean)
    )

    const { data: activeLeaseRows, error: activeErr } = await admin
      .from('leases')
      .select('tenant_user_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .not('unit_id', 'is', null)
      .not('tenant_user_id', 'is', null)

    if (activeErr) throw activeErr

    const summaryRows = await getStatementSummaryRows({
      admin,
      orgId: organizationId,
      limit: 5000,
    })

    const rowsWithArrears = summaryRows.filter((row) => Number(row.current_balance || 0) > 0)
    const defaulters = rowsWithArrears.length
    const totalArrearsAmount = rowsWithArrears.reduce(
      (sum, row) => sum + Number(row.current_balance || 0),
      0
    )

    const buildingTotals = new Map<string, { name: string; sum: number }>()
    for (const row of rowsWithArrears) {
      if (!row.building_id) continue
      const current = buildingTotals.get(row.building_id) || { name: row.building_name || 'Building', sum: 0 }
      buildingTotals.set(row.building_id, { name: current.name, sum: current.sum + Number(row.current_balance || 0) })
    }

    let topBuilding: { building_id: string; building_name: string; arrears_amount: number } | null = null
    for (const [buildingId, v] of buildingTotals.entries()) {
      if (!topBuilding || v.sum > topBuilding.arrears_amount) {
        topBuilding = { building_id: buildingId, building_name: v.name, arrears_amount: v.sum }
      }
    }

    const activeTenantIds = new Set(
      (activeLeaseRows || [])
        .map((row: any) => row.tenant_user_id)
        .filter((id: string) => Boolean(id) && !archivedTenantIds.has(id))
    )
    const active = activeTenantIds.size
    const pct = active > 0 ? Math.round((defaulters / active) * 100) : 0

    return NextResponse.json({
      success: true,
      data: {
        active_tenants: active,
        defaulters,
        defaulters_pct: pct,
        total_arrears_amount: totalArrearsAmount,
        top_building: topBuilding,
      },
    })
  } catch (error) {
    console.error('[Dashboard.DefaultersSummary.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load summary' },
      { status: 500 }
    )
  }
}
