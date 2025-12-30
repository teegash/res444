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

    const { count: activeTenants, error: activeErr } = await admin
      .from('leases')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .not('unit_id', 'is', null)
      .not('tenant_user_id', 'is', null)

    if (activeErr) throw activeErr

    const { data: arrearsRows, error: arrearsErr } = await admin
      .from('vw_lease_arrears_detail')
      .select('lease_id, unit_id, arrears_amount')
      .eq('organization_id', organizationId)
      .gt('arrears_amount', 0)
      .limit(2000)

    if (arrearsErr) throw arrearsErr

    const defaulters = (arrearsRows || []).length
    const totalArrearsAmount = (arrearsRows || []).reduce(
      (sum, r: any) => sum + Number(r.arrears_amount || 0),
      0
    )

    let topBuilding:
      | null
      | { building_id: string; building_name: string; arrears_amount: number } = null

    const unitIds = Array.from(
      new Set((arrearsRows || []).map((r: any) => r.unit_id).filter(Boolean))
    )

    if (unitIds.length > 0) {
      const { data: units, error: unitErr } = await admin
        .from('apartment_units')
        .select('id, building_id, apartment_buildings ( id, name )')
        .eq('organization_id', organizationId)
        .in('id', unitIds)

      if (!unitErr && units) {
        const unitToBuilding = new Map<string, { id: string; name: string }>()
        for (const u of units as any[]) {
          const b = u.apartment_buildings
          if (u.id && b?.id) unitToBuilding.set(u.id, { id: b.id, name: b.name || 'Building' })
        }

        const buildingTotals = new Map<string, { name: string; sum: number }>()
        for (const row of arrearsRows as any[]) {
          const unitId = row.unit_id
          const b = unitToBuilding.get(unitId)
          if (!b) continue
          const current = buildingTotals.get(b.id) || { name: b.name, sum: 0 }
          buildingTotals.set(b.id, { name: current.name, sum: current.sum + Number(row.arrears_amount || 0) })
        }

        for (const [buildingId, v] of buildingTotals.entries()) {
          if (!topBuilding || v.sum > topBuilding.arrears_amount) {
            topBuilding = { building_id: buildingId, building_name: v.name, arrears_amount: v.sum }
          }
        }
      }
    }

    const active = activeTenants || 0
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
