import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRange, safePct } from '../utils'

function clamp0(value: number) {
  return value < 0 ? 0 : value
}

function daysBetween(dateISO: string, nowISO: string) {
  const due = new Date(dateISO).getTime()
  const now = new Date(nowISO).getTime()
  if (Number.isNaN(due) || Number.isNaN(now)) return 0
  return Math.max(0, Math.floor((now - due) / 86400000))
}

function ageingBucket(days: number) {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function monthStartIso(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

function isRentPrepaid(inv: any) {
  if (String(inv?.invoice_type || '') !== 'rent') return false
  const paidUntil = monthStartIso(inv?.lease?.rent_paid_until)
  const periodStart = monthStartIso(inv?.period_start || inv?.due_date)
  if (!paidUntil || !periodStart) return false
  return paidUntil >= periodStart
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

    if (membershipError) {
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    const orgId = membership?.organization_id
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 })
    }

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    const todayISO = new Date().toISOString().slice(0, 10)
    const nowISO = new Date().toISOString()

    let invoiceQuery = admin
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
          id,
          tenant_user_id,
          rent_paid_until,
          status,
          unit:apartment_units!leases_unit_org_fk (
            id,
            unit_number,
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])

    if (range.start) invoiceQuery = invoiceQuery.gte('period_start', range.start)
    invoiceQuery = invoiceQuery.lte('period_start', range.end)

    const { data: overdueInvoices, error: invErr } = await invoiceQuery
    if (invErr) throw invErr

    const validLeaseStatuses = new Set(['active', 'renewed', 'ended', 'expired', 'valid'])
    const filteredInvoices = (overdueInvoices || []).filter((inv: any) => {
      const leaseStatus = String(inv?.lease?.status || '').toLowerCase()
      return validLeaseStatuses.has(leaseStatus)
    })
    const scopedInvoices = scopePropertyId
      ? filteredInvoices.filter((inv: any) => inv.lease?.unit?.building?.id === scopePropertyId)
      : filteredInvoices

    const tenantIds = Array.from(
      new Set(scopedInvoices.map((inv: any) => inv.lease?.tenant_user_id).filter(Boolean))
    )
    let profilesById = new Map<string, { full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length) {
      const { data: profiles, error: profilesError } = await admin
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .in('id', tenantIds)
      if (profilesError) throw profilesError
      profilesById = new Map(
        (profiles || []).map((profile: any) => [profile.id, profile] as any)
      )
    }

    const archivedByTenant = new Map<string, string | null>()
    if (tenantIds.length) {
      const { data: archives, error: archiveError } = await admin
        .from('tenant_archives')
        .select('tenant_user_id, archived_at')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .in('tenant_user_id', tenantIds)

      if (archiveError) {
        console.warn('[Reports.Arrears] archive lookup failed', archiveError)
      } else {
        ;(archives || []).forEach((row: any) => {
          if (row?.tenant_user_id) {
            archivedByTenant.set(row.tenant_user_id, row.archived_at || null)
          }
        })
      }
    }

    let arrearsTotal = 0
    let arrearsRent = 0
    let arrearsWater = 0
    let overdueInvoicesCount = 0
    const ageingMap: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }

    const byProperty: Record<string, any> = {}
    const defaulters: Record<string, any> = {}

    for (const inv of scopedInvoices) {
      const statusText = String(inv?.status_text || '').toLowerCase()
      if (statusText === 'paid') continue

      const due = inv.due_date
      if (!due) continue
      if (due >= todayISO) continue

      const amount = Number(inv.amount || 0)
      const outstanding = clamp0(amount)
      if (outstanding <= 0) continue
      overdueInvoicesCount += 1

      const days = daysBetween(due, nowISO)
      const bucket = ageingBucket(days)

      const propertyId = inv.lease?.unit?.building?.id
      const propertyName = inv.lease?.unit?.building?.name || 'Property'
      const unitNumber = inv.lease?.unit?.unit_number || ''
      const tenantId = inv.lease?.tenant_user_id
      const invoiceType = String(inv.invoice_type || '').toLowerCase()

      arrearsTotal += outstanding
      if (invoiceType === 'rent') arrearsRent += outstanding
      if (invoiceType === 'water') arrearsWater += outstanding
      ageingMap[bucket] += outstanding

      if (propertyId) {
        byProperty[propertyId] ||= {
          propertyId,
          propertyName,
          arrearsTotal: 0,
          arrearsRent: 0,
          arrearsWater: 0,
          invoicesCount: 0,
          defaultersCount: 0,
        }
        byProperty[propertyId].arrearsTotal += outstanding
        byProperty[propertyId].invoicesCount += 1
        if (invoiceType === 'rent') byProperty[propertyId].arrearsRent += outstanding
        if (invoiceType === 'water') byProperty[propertyId].arrearsWater += outstanding
      }

      const defKey = `${tenantId || 'unknown'}|${propertyId || 'unknown'}|${unitNumber || ''}`
      defaulters[defKey] ||= {
        tenant_user_id: tenantId,
        tenant_name: tenantId ? profilesById.get(tenantId)?.full_name || 'Tenant' : 'Tenant',
        tenant_phone: tenantId ? profilesById.get(tenantId)?.phone_number || null : null,
        is_archived: tenantId ? archivedByTenant.has(tenantId) : false,
        archived_at: tenantId ? archivedByTenant.get(tenantId) || null : null,
        lease_id: inv.lease?.id || null,
        propertyId,
        propertyName,
        unitNumber,
        arrearsTotal: 0,
        arrearsRent: 0,
        arrearsWater: 0,
        openInvoices: 0,
        oldestDueDate: due,
        maxDaysOverdue: days,
      }

      const row = defaulters[defKey]
      row.arrearsTotal += outstanding
      row.openInvoices += 1
      row.maxDaysOverdue = Math.max(row.maxDaysOverdue, days)
      row.oldestDueDate =
        row.oldestDueDate && row.oldestDueDate < due ? row.oldestDueDate : due
      if (invoiceType === 'rent') row.arrearsRent += outstanding
      if (invoiceType === 'water') row.arrearsWater += outstanding
    }

    const defRows = Object.values(defaulters)
    const defByPropertyTenants: Record<string, Set<string>> = {}
    for (const row of defRows as any[]) {
      const propertyId = row.propertyId
      const tenantId = row.tenant_user_id
      if (!propertyId || !tenantId) continue
      defByPropertyTenants[propertyId] ||= new Set()
      defByPropertyTenants[propertyId].add(tenantId)
    }
    for (const pid of Object.keys(byProperty)) {
      byProperty[pid].defaultersCount = defByPropertyTenants[pid]?.size || 0
    }
    const defaultersCount = new Set(
      (defRows as any[])
        .map((row) => row.tenant_user_id)
        .filter((tenantId: string | null | undefined): tenantId is string => Boolean(tenantId))
    ).size

    const byPropertyRows = Object.values(byProperty).sort(
      (a: any, b: any) => b.arrearsTotal - a.arrearsTotal
    )
    const defaultersRows = defRows.sort((a: any, b: any) => b.arrearsTotal - a.arrearsTotal)

    let billedPeriod = 0
    let billedQuery = admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        period_start,
        lease:leases!invoices_lease_org_fk (
          status,
          unit:apartment_units!leases_unit_org_fk (
            building:apartment_buildings!apartment_units_building_org_fk ( id )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])

    if (range.start) billedQuery = billedQuery.gte('period_start', range.start)
    billedQuery = billedQuery.lte('period_start', range.end)

    const { data: billedInvoices, error: billedErr } = await billedQuery
    if (!billedErr) {
      const billedFiltered = (billedInvoices || []).filter((inv: any) => {
        const leaseStatus = String(inv?.lease?.status || '').toLowerCase()
        return validLeaseStatuses.has(leaseStatus)
      })
      const billedScoped = scopePropertyId
        ? billedFiltered.filter((inv: any) => inv.lease?.unit?.building?.id === scopePropertyId)
        : billedFiltered
      billedPeriod = billedScoped.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0)
    }

    const arrearsRate = billedPeriod > 0 ? safePct(arrearsTotal, billedPeriod) : 0

    return NextResponse.json({
      success: true,
      data: {
        range,
        properties: properties || [],
        todayISO,
        kpis: {
          arrearsTotal,
          arrearsRent,
          arrearsWater,
          defaultersCount,
          overdueInvoicesCount,
          arrearsRate,
        },
        ageing: Object.entries(ageingMap).map(([bucket, amount]) => ({ bucket, amount })),
        byProperty: byPropertyRows,
        defaulters: defaultersRows,
        topDefaulters: defaultersRows.slice(0, 20),
      },
    })
  } catch (error: any) {
    console.error('[Reports.Arrears] Failed', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load arrears report.' },
      { status: 500 }
    )
  }
}
