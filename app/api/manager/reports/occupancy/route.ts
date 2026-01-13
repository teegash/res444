import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRange } from '../utils'

type UnitStatus = 'vacant' | 'renovating' | 'occupied' | 'notice' | 'unknown'

function normalizeStatus(status: any): UnitStatus {
  const value = String(status || '').toLowerCase()
  if (value === 'vacant') return 'vacant'
  if (value === 'renovating') return 'renovating'
  if (value === 'occupied') return 'occupied'
  if (value === 'notice') return 'notice'
  return 'unknown'
}

function safePct(n: number, d: number) {
  if (!d || d <= 0) return 0
  return (n / d) * 100
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') || 'quarter'
    const propertyId = url.searchParams.get('propertyId') || 'all'
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const range = resolveRange({ period, startDate, endDate })
    const scopePropertyId = propertyId !== 'all' ? propertyId : null

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
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const orgId = membership?.organization_id
    if (membershipError || !orgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 })
    }

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    let unitsQ = admin
      .from('apartment_units')
      .select(
        `
        id,
        unit_number,
        status,
        notice_vacate_date,
        building_id,
        building:apartment_buildings!apartment_units_building_org_fk (
          id,
          name
        ),
        leases:leases (
          id,
          start_date,
          end_date,
          status,
          tenant_user_id
        )
      `
      )
      .eq('organization_id', orgId)

    if (scopePropertyId) unitsQ = unitsQ.eq('building_id', scopePropertyId)

    const { data: unitsRaw, error: unitsErr } = await unitsQ
    if (unitsErr) throw unitsErr

    const nowIso = new Date().toISOString().slice(0, 10)
    const units = (unitsRaw || []).map((unit: any) => {
      const leases = Array.isArray(unit.leases) ? unit.leases : []
      const activeLease =
        leases.find((l: any) => String(l.status || '').toLowerCase() === 'active') ||
        leases.find((l: any) => l.end_date && l.end_date >= nowIso) ||
        leases[0] ||
        null
      let leaseStatus = activeLease?.status || null
      if (activeLease?.end_date && activeLease.end_date < nowIso) {
        const normalized = String(leaseStatus || '').toLowerCase()
        if (!normalized || !['ended', 'cancelled', 'expired'].includes(normalized)) {
          leaseStatus = 'expired'
        }
      }

      return {
        id: unit.id,
        unit_number: unit.unit_number || '',
        status: normalizeStatus(unit.status),
        notice_vacate_date: unit.notice_vacate_date || null,
        building_id: unit.building_id,
        building_name: unit.building?.name || 'Property',
        lease_id: activeLease?.id || null,
        lease_start: activeLease?.start_date || null,
        lease_end: activeLease?.end_date || null,
        lease_status: leaseStatus,
        tenant_user_id: activeLease?.tenant_user_id || null,
        tenant_name: null as string | null,
      }
    })

    const tenantIds = Array.from(
      new Set(units.map((unit) => unit.tenant_user_id).filter(Boolean) as string[])
    )
    const archivedTenantIds = new Set<string>()
    if (tenantIds.length) {
      const { data: archives, error: archiveError } = await admin
        .from('tenant_archives')
        .select('tenant_user_id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .in('tenant_user_id', tenantIds)

      if (archiveError) {
        console.warn('[Reports.Occupancy] archive lookup failed', archiveError)
      } else {
        ;(archives || []).forEach((row: any) => {
          if (row?.tenant_user_id) archivedTenantIds.add(row.tenant_user_id)
        })
      }
    }
    if (tenantIds.length) {
      const { data: tenants, error: tenantsError } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .in('id', tenantIds)
      if (tenantsError) throw tenantsError

      const tenantNameById = new Map((tenants || []).map((tenant: any) => [tenant.id, tenant.full_name]))
      for (const unit of units) {
        if (unit.tenant_user_id) {
          unit.tenant_name = tenantNameById.get(unit.tenant_user_id) || null
        }
        unit.is_archived = unit.tenant_user_id ? archivedTenantIds.has(unit.tenant_user_id) : false
      }
    }

    const counts: Record<UnitStatus, number> = {
      vacant: 0,
      renovating: 0,
      occupied: 0,
      notice: 0,
      unknown: 0,
    }

    for (const unit of units) {
      counts[unit.status] += 1
    }

    const totalUnits = units.length
    const occupiedLike = counts.occupied + counts.notice
    const occupancyRate = safePct(occupiedLike, totalUnits)

    const byPropertyMap: Record<string, any> = {}
    for (const unit of units) {
      byPropertyMap[unit.building_id] ||= {
        propertyId: unit.building_id,
        propertyName: unit.building_name,
        totalUnits: 0,
        occupied: 0,
        notice: 0,
        vacant: 0,
        renovating: 0,
        unknown: 0,
        occupancyRate: 0,
      }
      const row = byPropertyMap[unit.building_id]
      row.totalUnits += 1
      row[unit.status] += 1
    }

    const byProperty = Object.values(byPropertyMap)
      .map((row: any) => ({
        ...row,
        occupancyRate: safePct((row.occupied || 0) + (row.notice || 0), row.totalUnits || 0),
      }))
      .sort((a: any, b: any) => b.occupancyRate - a.occupancyRate)

    const statusDonut = (['occupied', 'notice', 'vacant', 'renovating', 'unknown'] as UnitStatus[])
      .map((key) => ({ name: key, value: counts[key] }))
      .filter((item) => item.value > 0)

    return NextResponse.json({
      success: true,
      data: {
        range,
        properties: properties || [],
        kpis: {
          totalUnits,
          occupied: counts.occupied,
          notice: counts.notice,
          vacant: counts.vacant,
          renovating: counts.renovating,
          occupancyRate,
        },
        statusDonut,
        byProperty,
        units,
      },
    })
  } catch (e: any) {
    console.error('[Reports.Occupancy] Failed', e)
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to load occupancy report.' },
      { status: 500 }
    )
  }
}
