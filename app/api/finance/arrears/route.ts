import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const { userId, role } = await requireAuth()

    if (role !== 'manager' && role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const buildingId = searchParams.get('building_id')
    const minArrearsRaw = searchParams.get('min_arrears')
    const minArrears = minArrearsRaw ? Number(minArrearsRaw) : 0
    const limitRaw = searchParams.get('limit')
    const limit = limitRaw ? Math.min(2000, Math.max(1, Number(limitRaw))) : 500

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

    let query = admin
      .from('vw_lease_arrears_detail')
      .select(
        'organization_id, lease_id, tenant_user_id, tenant_name, tenant_phone, unit_id, unit_number, arrears_amount, open_invoices_count, oldest_due_date'
      )
      .eq('organization_id', organizationId)
      .order('arrears_amount', { ascending: false })
      .limit(limit)

    if (Number.isFinite(minArrears) && minArrears > 0) {
      query = query.gte('arrears_amount', minArrears)
    }

    const { data, error } = await query

    if (error) throw error

    const baseRows = data ?? []

    const tenantIds = Array.from(
      new Set(baseRows.map((row: any) => row.tenant_user_id).filter(Boolean))
    )

    const archivedTenantIds = new Set<string>()
    if (tenantIds.length > 0) {
      const { data: archives, error: archiveError } = await admin
        .from('tenant_archives')
        .select('tenant_user_id')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .in('tenant_user_id', tenantIds)

      if (archiveError) {
        console.error('[Finance.Arrears.GET] Failed to load tenant archives', archiveError)
      } else {
        ;(archives || []).forEach((row: any) => {
          if (row?.tenant_user_id) archivedTenantIds.add(row.tenant_user_id)
        })
      }
    }

    const scopedRows = baseRows.filter(
      (row: any) => !row?.tenant_user_id || !archivedTenantIds.has(row.tenant_user_id)
    )

    const unitIds = Array.from(new Set(scopedRows.map((r: any) => r.unit_id).filter(Boolean)))

    const unitToBuilding = new Map<
      string,
      { building_id: string | null; building_name: string | null; building_location: string | null }
    >()

    if (unitIds.length > 0) {
      const { data: units, error: unitErr } = await admin
        .from('apartment_units')
        .select('id, building_id, apartment_buildings ( id, name, location )')
        .eq('organization_id', organizationId)
        .in('id', unitIds)

      if (unitErr) throw unitErr

      for (const u of (units as any[]) || []) {
        const b = u.apartment_buildings
        unitToBuilding.set(u.id, {
          building_id: b?.id ?? u.building_id ?? null,
          building_name: b?.name ?? null,
          building_location: b?.location ?? null,
        })
      }
    }

    let finalRows = scopedRows.map((r: any) => {
      const extra = r.unit_id ? unitToBuilding.get(r.unit_id) : null
      return {
        ...r,
        building_id: extra?.building_id ?? null,
        building_name: extra?.building_name ?? null,
        building_location: extra?.building_location ?? null,
      }
    })

    if (buildingId) {
      finalRows = finalRows.filter((r: any) => r.building_id === buildingId)
    }

    return NextResponse.json({ success: true, data: finalRows })
  } catch (error) {
    console.error('[Finance.Arrears.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch arrears' },
      { status: 500 }
    )
  }
}
