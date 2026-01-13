import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'

function clamp0(value: number) {
  return value < 0 ? 0 : value
}

function monthStartIso(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function isPastDue(dueIso: string | null, todayIso: string) {
  if (!dueIso) return false
  return dueIso < todayIso
}

function isInvoiceEffectivelyPaid(inv: any) {
  const amount = Number(inv?.amount ?? 0)
  const totalPaid = Number(inv?.total_paid ?? 0)
  const statusText = String(inv?.status_text || '').toLowerCase()
  if (statusText === 'paid') return true
  if (inv?.status === true) return true
  return totalPaid >= amount - 0.05
}

function isRentPrepaid(inv: any) {
  if (String(inv?.invoice_type || '') !== 'rent') return false
  const paidUntil = monthStartIso(inv?.lease?.rent_paid_until)
  const periodStart = monthStartIso(inv?.period_start || inv?.due_date)
  if (!paidUntil || !periodStart) return false
  return paidUntil >= periodStart
}

const ACTIVE_LEASE_STATUSES = new Set(['active', 'pending'])

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

    const todayIso = new Date().toISOString().slice(0, 10)

    const { data: arrearsRows, error: arrearsErr } = await admin
      .from('invoices')
      .select(
        `
        id,
        invoice_type,
        amount,
        total_paid,
        due_date,
        period_start,
        status_text,
        status,
        lease:leases!invoices_lease_org_fk (
          tenant_user_id,
          rent_paid_until,
          status,
          unit:apartment_units!leases_unit_org_fk (
            id,
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', organizationId)
      .in('invoice_type', ['rent', 'water'])
      .limit(5000)

    if (arrearsErr) throw arrearsErr

    const defaulterTenantIds = new Set<string>()
    const buildingTotals = new Map<string, { name: string; sum: number }>()
    let totalArrearsAmount = 0

    for (const inv of arrearsRows || []) {
      const statusText = String(inv?.status_text || '').toLowerCase()
      if (statusText === 'void') continue
      if (isRentPrepaid(inv)) continue

      const tenantId = inv?.lease?.tenant_user_id
      if (!tenantId || archivedTenantIds.has(tenantId)) continue
      const leaseStatus = String(inv?.lease?.status || '').toLowerCase()
      if (leaseStatus && !ACTIVE_LEASE_STATUSES.has(leaseStatus)) continue

      const dueIso = normalizeIsoDate(inv?.due_date)
      if (!isPastDue(dueIso, todayIso)) continue
      if (isInvoiceEffectivelyPaid(inv)) continue

      const amount = Number(inv?.amount || 0)
      const paid = Number(inv?.total_paid || 0)
      const outstanding = clamp0(amount - paid)
      if (outstanding <= 0) continue

      defaulterTenantIds.add(tenantId)
      totalArrearsAmount += outstanding

      const building = inv?.lease?.unit?.building
      if (building?.id) {
        const current = buildingTotals.get(building.id) || { name: building.name || 'Building', sum: 0 }
        buildingTotals.set(building.id, { name: current.name, sum: current.sum + outstanding })
      }
    }

    const defaulters = defaulterTenantIds.size

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
