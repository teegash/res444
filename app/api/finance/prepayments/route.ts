import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import { createAdminClient } from '@/lib/supabase/admin'

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
const addMonthsUtc = (monthStart: Date, months: number) =>
  new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + months, 1))
const monthsBetweenMonthStarts = (fromMonthStart: Date, toMonthStart: Date) =>
  (toMonthStart.getUTCFullYear() - fromMonthStart.getUTCFullYear()) * 12 +
  (toMonthStart.getUTCMonth() - fromMonthStart.getUTCMonth())

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

    // Fetch active leases + tenant/unit info, then compute prepayment coverage from invoice truth.
    const { data: leases, error: leaseErr } = await admin
      .from('leases')
      .select(
        `
        id,
        organization_id,
        tenant_user_id,
        unit_id,
        start_date,
        status,
        unit:apartment_units (
          unit_number
        )
      `
      )
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(500)

    if (leaseErr) throw leaseErr

    const leaseRows = Array.isArray(leases) ? leases : []
    if (leaseRows.length === 0) return NextResponse.json({ success: true, data: [] })

    // Load tenant profile details (PostgREST can't embed user_profiles from leases without an FK).
    const tenantIds = Array.from(
      new Set(leaseRows.map((l: any) => l?.tenant_user_id).filter(Boolean) as string[])
    )
    const tenantProfileById = new Map<string, { full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length) {
      const { data: profiles, error: profErr } = await admin
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', organizationId)
        .in('id', tenantIds)
      if (profErr) throw profErr
      for (const p of profiles ?? []) {
        tenantProfileById.set(String((p as any).id), {
          full_name: (p as any).full_name ?? null,
          phone_number: (p as any).phone_number ?? null,
        })
      }
    }

    const now = new Date()
    const currentMonthStart = startOfMonthUtc(now)
    const nextMonthStart = addMonthsUtc(currentMonthStart, 1)
    const scanEnd = addMonthsUtc(currentMonthStart, 60)

    const leaseIds = leaseRows.map((l: any) => String(l.id)).filter(Boolean)

    const { data: invoices, error: invErr } = await admin
      .from('invoices')
      .select('lease_id, period_start, amount, status, status_text, total_paid')
      .eq('organization_id', organizationId)
      .eq('invoice_type', 'rent')
      .not('period_start', 'is', null)
      .in('lease_id', leaseIds)
      .gte('period_start', ymd(currentMonthStart))
      .lt('period_start', ymd(scanEnd))

    if (invErr) throw invErr

    const paidMonthsByLease = new Map<string, Set<string>>()
    for (const inv of invoices ?? []) {
      const leaseId = inv.lease_id ? String(inv.lease_id) : null
      if (!leaseId) continue
      if (inv.status_text === 'void') continue

      const amount = Number((inv as any).amount || 0)
      const totalPaid = Number((inv as any).total_paid || 0)
      const isPaid =
        inv.status === true || inv.status_text === 'paid' || (amount > 0 && totalPaid >= amount * 0.999)
      if (!isPaid) continue

      const key = String(inv.period_start)
      const set = paidMonthsByLease.get(leaseId) || new Set<string>()
      set.add(key)
      paidMonthsByLease.set(leaseId, set)
    }

    const computeEligibleStart = (leaseStartRaw: string | null) => {
      if (!leaseStartRaw) return currentMonthStart
      const leaseStart = new Date(leaseStartRaw)
      if (Number.isNaN(leaseStart.getTime())) return currentMonthStart
      const startMonth = startOfMonthUtc(leaseStart)
      return leaseStart.getUTCDate() > 1 ? addMonthsUtc(startMonth, 1) : startMonth
    }

    const computeCoverage = (leaseId: string, leaseStartRaw: string | null) => {
      const eligibleStart = computeEligibleStart(leaseStartRaw)
      const scanStart = eligibleStart > currentMonthStart ? eligibleStart : currentMonthStart

      const paidSet = paidMonthsByLease.get(leaseId) || new Set<string>()
      let cursor = scanStart
      for (let i = 0; i < 60; i += 1) {
        const key = ymd(cursor)
        if (!paidSet.has(key)) break
        cursor = addMonthsUtc(cursor, 1)
      }

      const nextDueKey = ymd(cursor)
      const eligibleKey = ymd(eligibleStart)
      const rentPaidUntil =
        nextDueKey !== ymd(scanStart) ? ymd(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 0))) : null

      const prepaidStart = eligibleStart > nextMonthStart ? eligibleStart : nextMonthStart
      const prepaidMonths =
        cursor > prepaidStart ? Math.max(0, monthsBetweenMonthStarts(prepaidStart, cursor)) : 0

      return {
        next_rent_due_date: nextDueKey,
        rent_paid_until: rentPaidUntil,
        prepaid_months: prepaidMonths,
        eligible_start: eligibleKey,
      }
    }

    const computed = leaseRows
      .map((lease: any) => {
        const leaseId = String(lease.id)
        const coverage = computeCoverage(leaseId, lease.start_date || null)
        if (coverage.prepaid_months <= 0) return null

        const tenantId = lease.tenant_user_id ? String(lease.tenant_user_id) : null
        const profile = tenantId ? tenantProfileById.get(tenantId) : undefined

        return {
          organization_id: organizationId,
          lease_id: leaseId,
          tenant_user_id: tenantId,
          tenant_name: profile?.full_name ?? null,
          tenant_phone: profile?.phone_number ?? null,
          unit_id: lease.unit_id ? String(lease.unit_id) : null,
          unit_number: lease.unit?.unit_number ?? null,
          rent_paid_until: coverage.rent_paid_until,
          next_rent_due_date: coverage.next_rent_due_date,
          prepaid_months: coverage.prepaid_months,
          is_prepaid: true,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(b.rent_paid_until || '').localeCompare(String(a.rent_paid_until || '')))

    return NextResponse.json({ success: true, data: computed })
  } catch (error) {
    console.error('[Finance.Prepayments.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch prepayments' },
      { status: 500 }
    )
  }
}
