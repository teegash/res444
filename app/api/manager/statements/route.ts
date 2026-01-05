import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>
type ManagerContextResult = { admin: AdminClient; orgId: string } | { error: NextResponse }

type StatementSummaryRow = {
  organization_id: string
  tenant_user_id: string
  tenant_name: string | null
  tenant_phone: string | null
  lease_id: string
  building_id: string | null
  building_name: string | null
  unit_number: string
  current_balance: number
  open_invoices_count: number
  last_payment_date: string | null
  oldest_due_date: string | null
}

async function getManagerContext(): Promise<ManagerContextResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      ),
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load organization.' }, { status: 500 }) }
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load profile.' }, { status: 500 }) }
  }

  const orgId = membership?.organization_id || profile?.organization_id
  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }) }
  }

  const role = (membership?.role || profile?.role || '') as (typeof MANAGER_ROLES)[number] | ''
  if (!role || !MANAGER_ROLES.includes(role)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, orgId }
}

function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function monthStartIso(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

function isInvoiceEffectivelyPaid(inv: any) {
  const amount = Number(inv?.amount ?? 0)
  const totalPaid = Number(inv?.total_paid ?? 0)
  const statusText = String(inv?.status_text || '').toLowerCase()
  if (statusText === 'paid') return true
  if (inv?.status === true) return true
  return totalPaid >= amount - 0.05
}

function isRentPrepaid(inv: any, rentPaidUntil: string | null | undefined) {
  if (String(inv?.invoice_type || '') !== 'rent') return false
  const paidUntil = monthStartIso(rentPaidUntil)
  const periodStart = monthStartIso(inv?.period_start || inv?.due_date)
  if (!paidUntil || !periodStart) return false
  return paidUntil >= periodStart
}

function isPastDue(dueIso: string | null, todayIso: string) {
  if (!dueIso) return false
  return dueIso < todayIso
}

function sortByBalanceAndOldestDue(rows: StatementSummaryRow[]) {
  return rows.sort((a, b) => {
    const aBal = Number(a.current_balance || 0)
    const bBal = Number(b.current_balance || 0)
    if (aBal !== bBal) return bBal - aBal

    const aDue = a.oldest_due_date ? new Date(a.oldest_due_date).getTime() : Number.POSITIVE_INFINITY
    const bDue = b.oldest_due_date ? new Date(b.oldest_due_date).getTime() : Number.POSITIVE_INFINITY
    if (aDue !== bDue) return aDue - bDue

    const aName = (a.tenant_name || '').toLowerCase()
    const bName = (b.tenant_name || '').toLowerCase()
    return aName.localeCompare(bName)
  })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }

    const { admin, orgId } = ctx

    const buildingId =
      request.nextUrl.searchParams.get('buildingId') || request.nextUrl.searchParams.get('building_id')
    const rawQ = request.nextUrl.searchParams.get('q')?.trim() || ''

    // Primary source: DB view (fast).
    let query = admin
      .from('vw_manager_statement_summary')
      .select('*')
      .eq('organization_id', orgId)

    if (buildingId) {
      query = query.eq('building_id', buildingId)
    }

    if (rawQ) {
      const q = rawQ.replace(/[,]/g, ' ')
      query = query.or(
        `tenant_name.ilike.%${q}%,building_name.ilike.%${q}%,unit_number.ilike.%${q}%`
      )
    }

    query = query
      .order('current_balance', { ascending: false })
      .order('oldest_due_date', { ascending: true })
      .limit(500)

    const viewRes = await query

    const { data: archiveRows, error: archiveError } = await admin
      .from('tenant_archives')
      .select('tenant_user_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)

    if (archiveError) {
      console.error('[ManagerStatementsList] Failed to load tenant archives', archiveError)
    }

    const archivedTenantIds = new Set(
      (archiveRows || []).map((row: any) => row.tenant_user_id).filter(Boolean)
    )

    const viewRows = ((viewRes.data || []) as any[])
      .map((row) => ({
        ...(row as any),
        current_balance: Number((row as any).current_balance ?? 0),
        open_invoices_count: Number((row as any).open_invoices_count ?? 0),
        last_payment_date: normalizeIsoDate((row as any).last_payment_date),
        oldest_due_date: normalizeIsoDate((row as any).oldest_due_date),
      }))
      .filter((row) => !archivedTenantIds.has(row.tenant_user_id)) as StatementSummaryRow[]

    const viewError = viewRes.error
    if (viewError) {
      console.error('[ManagerStatementsList] Failed to load summary view (will fallback)', viewError)
    }

    // Fallback / completion: some orgs may have the view defined from an arrears-only source.
    // Ensure we still include active leases with 0 balance (tenants who have fully paid).
    const existingLeaseIds = new Set(viewRows.map((row) => row.lease_id).filter(Boolean))

    let unitIdsForBuilding: string[] | null = null
    if (buildingId) {
      const { data: units, error: unitError } = await admin
        .from('apartment_units')
        .select('id')
        .eq('organization_id', orgId)
        .eq('building_id', buildingId)
        .limit(5000)
      if (unitError) {
        console.error('[ManagerStatementsList] Failed to load units for building filter', unitError)
      } else {
        unitIdsForBuilding = (units || []).map((u) => u.id).filter(Boolean)
      }
    }

    let leasesQuery = admin
      .from('leases')
      .select(
        `
        id,
        tenant_user_id,
        unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1000)

    if (unitIdsForBuilding && unitIdsForBuilding.length > 0) {
      leasesQuery = leasesQuery.in('unit_id', unitIdsForBuilding)
    }

    const { data: leaseRows, error: leaseError } = await leasesQuery
    if (leaseError) {
      console.error('[ManagerStatementsList] Failed to load leases for completeness', leaseError)
    }

    const leases = (leaseRows || [])
      .filter((lease: any) => !archivedTenantIds.has(lease?.tenant_user_id)) as any[]
    const missingLeases = leases.filter((lease) => lease?.id && !existingLeaseIds.has(lease.id))

    const missingLeaseIds = missingLeases.map((lease) => lease.id).filter(Boolean)
    const missingTenantIds = Array.from(
      new Set(missingLeases.map((lease) => lease.tenant_user_id).filter(Boolean))
    )

    let tenantProfiles: any[] = []
    if (missingTenantIds.length) {
      const { data, error: profileError } = await admin
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .in('id', missingTenantIds)

      if (profileError) {
        console.error('[ManagerStatementsList] Failed to load tenant profiles for completeness', profileError)
      } else {
        tenantProfiles = data || []
      }
    }

    const profileMap = new Map<string, { name: string | null; phone: string | null }>(
      tenantProfiles.map((p: any) => [p.id, { name: p.full_name || null, phone: p.phone_number || null }])
    )

    const leaseIdsForBalance = Array.from(
      new Set([...viewRows.map((row) => row.lease_id), ...missingLeaseIds].filter(Boolean))
    )

    const { data: leaseMeta, error: leaseMetaError } = await admin
      .from('leases')
      .select('id, rent_paid_until')
      .eq('organization_id', orgId)
      .in('id', leaseIdsForBalance.length ? leaseIdsForBalance : ['00000000-0000-0000-0000-000000000000'])

    if (leaseMetaError) {
      console.error('[ManagerStatementsList] Failed to load lease prepayment markers', leaseMetaError)
    }

    const rentPaidUntilByLease = new Map(
      (leaseMeta || []).map((lease: any) => [lease.id, lease.rent_paid_until || null])
    )

    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select('id, lease_id, due_date, period_start, amount, total_paid, status, status_text, invoice_type')
      .eq('organization_id', orgId)
      .in('lease_id', leaseIdsForBalance.length ? leaseIdsForBalance : ['00000000-0000-0000-0000-000000000000'])
      .limit(20000)

    if (invoiceError) {
      console.error('[ManagerStatementsList] Failed to load invoices for completeness', invoiceError)
    }

    const invoiceRows = (invoices || []) as any[]
    const invoiceToLease = new Map<string, string>()
    const invoiceIds: string[] = []
    for (const inv of invoiceRows) {
      if (inv?.id && inv?.lease_id) {
        invoiceToLease.set(inv.id, inv.lease_id)
        invoiceIds.push(inv.id)
      }
    }

    const aggByLease = new Map<string, { openCount: number; oldestDue: string | null; balance: number }>()
    const todayIso = new Date().toISOString().slice(0, 10)

    for (const inv of invoiceRows) {
      const leaseId = inv?.lease_id
      if (!leaseId) continue
      const invoiceType = String(inv?.invoice_type || '')
      if (invoiceType !== 'rent' && invoiceType !== 'water') continue
      if (String(inv?.status_text || '').toLowerCase() === 'void') continue
      const dueIso = normalizeIsoDate(inv?.due_date)
      if (!isPastDue(dueIso, todayIso)) continue
      const rentPaidUntil = rentPaidUntilByLease.get(leaseId)
      if (isRentPrepaid(inv, rentPaidUntil)) continue
      if (isInvoiceEffectivelyPaid(inv)) continue

      const amount = Number(inv?.amount ?? 0)
      const totalPaid = Number(inv?.total_paid ?? 0)
      const outstanding = Math.max(0, amount - totalPaid)
      if (outstanding <= 0) continue

      const next = aggByLease.get(leaseId) || { openCount: 0, oldestDue: null, balance: 0 }
      next.openCount += 1
      next.balance += outstanding
      if (dueIso && (!next.oldestDue || new Date(dueIso).getTime() < new Date(next.oldestDue).getTime())) {
        next.oldestDue = dueIso
      }
      aggByLease.set(leaseId, next)
    }

    const lastPaymentByLease = new Map<string, string>()
    if (invoiceIds.length > 0) {
      const { data: payments, error: payError } = await admin
        .from('payments')
        .select('invoice_id, payment_date')
        .eq('organization_id', orgId)
        .eq('verified', true)
        .in('invoice_id', invoiceIds)
        .limit(20000)

      if (payError) {
        console.error('[ManagerStatementsList] Failed to load payments for completeness', payError)
      } else {
        for (const p of payments || []) {
          const invoiceId = (p as any)?.invoice_id
          const leaseId = invoiceId ? invoiceToLease.get(invoiceId) : null
          if (!leaseId) continue
          const paidIso = normalizeIsoDate((p as any)?.payment_date)
          if (!paidIso) continue
          const existing = lastPaymentByLease.get(leaseId)
          if (!existing || new Date(paidIso).getTime() > new Date(existing).getTime()) {
            lastPaymentByLease.set(leaseId, paidIso)
          }
        }
      }
    }

    const qLower = rawQ.toLowerCase()
    const matchesSearch = (row: StatementSummaryRow) => {
      if (!qLower) return true
      const haystack = `${row.tenant_name || ''} ${row.building_name || ''} ${row.unit_number || ''}`.toLowerCase()
      return haystack.includes(qLower)
    }

    const computedRows: StatementSummaryRow[] = missingLeases
      .map((lease) => {
        const building = lease?.unit?.building
        const profile = profileMap.get(lease.tenant_user_id) || { name: null, phone: null }
        const agg = aggByLease.get(lease.id) || { openCount: 0, oldestDue: null, balance: 0 }

        const row: StatementSummaryRow = {
          organization_id: orgId,
          tenant_user_id: lease.tenant_user_id,
          tenant_name: profile.name,
          tenant_phone: profile.phone,
          lease_id: lease.id,
          building_id: building?.id || lease?.unit?.building_id || null,
          building_name: building?.name || 'Property',
          unit_number: lease?.unit?.unit_number || '',
          current_balance: Number(agg.balance || 0),
          open_invoices_count: Number(agg.openCount || 0),
          last_payment_date: lastPaymentByLease.get(lease.id) || null,
          oldest_due_date: agg.oldestDue,
        }
        return row
      })
      .filter((row) => Boolean(row.tenant_user_id && row.lease_id))
      .filter(matchesSearch)

    const adjustedViewRows = viewRows.map((row) => {
      const agg = aggByLease.get(row.lease_id) || { openCount: 0, oldestDue: null, balance: 0 }
      return {
        ...row,
        current_balance: Number(agg.balance || 0),
        open_invoices_count: Number(agg.openCount || 0),
        oldest_due_date: agg.oldestDue || null,
      }
    })

    const finalRows = sortByBalanceAndOldestDue([...adjustedViewRows, ...computedRows]).slice(0, 500)

    return NextResponse.json({ success: true, rows: finalRows, data: finalRows })
  } catch (error) {
    console.error('[ManagerStatementsList] Failed to load statements summary', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load statements.' },
      { status: 500 }
    )
  }
}
