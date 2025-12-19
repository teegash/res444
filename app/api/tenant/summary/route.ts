import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function parseCurrency(value?: string | null, fallback?: number | null) {
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[^0-9.]/g, ''))
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric
    }
  }
  if (typeof fallback === 'number') {
    return fallback
  }
  return null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
const addMonthsUtc = (monthStart: Date, months: number) =>
  new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + months, 1))
const monthsBetweenMonthStarts = (fromMonthStart: Date, toMonthStart: Date) =>
  (toMonthStart.getUTCFullYear() - fromMonthStart.getUTCFullYear()) * 12 +
  (toMonthStart.getUTCMonth() - fromMonthStart.getUTCMonth())

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    const { data: profile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url, address')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        status,
        start_date,
        end_date,
        monthly_rent,
        rent_paid_until,
        next_rent_due_date,
        unit:apartment_units (
          id,
          unit_number,
          unit_price_category,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    const monthlyRent = lease
      ? parseCurrency(lease.unit?.unit_price_category, lease.monthly_rent)
      : null

    const unitLabel =
      lease?.unit?.unit_number && lease?.unit?.building?.name
        ? `${lease.unit.unit_number} • ${lease.unit.building.name}`
        : lease?.unit?.unit_number || null

    // Compute paid-through + prepaid months using invoice truth and contiguous coverage.
    // Definitions:
    // - next_rent_due_date: first UNPAID/MISSING rent month (month-start key)
    // - rent_paid_until: last day of the latest CONTIGUOUS paid month before next_rent_due_date
    // - prepaid_months: number of fully paid FUTURE months starting next month (decrements over time)
    let computedRentPaidUntil: string | null = null
    let computedNextRentDue: string | null = null
    let prepaidMonths = 0

    if (lease?.id) {
      const now = new Date()
      const currentMonthStart = startOfMonthUtc(now)
      const nextMonthStart = addMonthsUtc(currentMonthStart, 1)

      let eligibleStart = currentMonthStart
      if (lease.start_date) {
        const leaseStart = new Date(lease.start_date)
        if (!Number.isNaN(leaseStart.getTime())) {
          const leaseStartMonth = startOfMonthUtc(leaseStart)
          eligibleStart = leaseStart.getUTCDate() > 1 ? addMonthsUtc(leaseStartMonth, 1) : leaseStartMonth
        }
      }

      const eligibleStartIso = ymd(eligibleStart)

      const { data: invoices, error: invErr } = await adminSupabase
        .from('invoices')
        .select('period_start, amount, status, status_text, total_paid')
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .not('period_start', 'is', null)
        .gte('period_start', eligibleStartIso)
        .order('period_start', { ascending: true })
        .limit(240)

      if (invErr) throw invErr

      const paidMonthKeys = new Set<string>()
      for (const inv of invoices ?? []) {
        if (!inv?.period_start) continue
        if (inv.status_text === 'void') continue
        const amount = Number(inv.amount || 0)
        const totalPaid = Number(inv.total_paid || 0)
        const isPaid =
          inv.status === true || inv.status_text === 'paid' || (amount > 0 && totalPaid >= amount * 0.999)
        if (isPaid) paidMonthKeys.add(String(inv.period_start))
      }

      let cursor = startOfMonthUtc(new Date(`${eligibleStartIso}T00:00:00.000Z`))
      for (let i = 0; i < 240; i += 1) {
        const key = ymd(cursor)
        if (!paidMonthKeys.has(key)) break
        cursor = addMonthsUtc(cursor, 1)
      }

      computedNextRentDue = ymd(cursor)

      if (computedNextRentDue !== eligibleStartIso) {
        // Day 0 of next due month == last day of previous month.
        const paidUntil = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 0))
        computedRentPaidUntil = ymd(paidUntil)
      }

      const nextDueMonthStart = startOfMonthUtc(new Date(`${computedNextRentDue}T00:00:00.000Z`))
      const prepaidStart = nextMonthStart > eligibleStart ? nextMonthStart : eligibleStart
      prepaidMonths =
        nextDueMonthStart > prepaidStart
          ? Math.max(0, monthsBetweenMonthStarts(prepaidStart, nextDueMonthStart))
          : 0
    }

    const payload = {
      profile: profile || null,
      lease: lease
        ? {
            id: lease.id,
            status: lease.status,
            start_date: lease.start_date,
            end_date: lease.end_date,
            monthly_rent: monthlyRent,
            unit_number: lease.unit?.unit_number || null,
            unit_label: unitLabel,
            property_name: lease.unit?.building?.name || null,
            property_location: lease.unit?.building?.location || null,
            unit_price_text: lease.unit?.unit_price_category || null,
            rent_paid_until: computedRentPaidUntil ?? lease.rent_paid_until ?? null,
            next_rent_due_date: computedNextRentDue ?? lease.next_rent_due_date ?? null,
            prepaid_months: prepaidMonths,
            paid_up_to_date: computedRentPaidUntil ?? lease.rent_paid_until ?? null,
          }
        : null,
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[TenantSummary] Failed to fetch tenant summary', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tenant summary.',
      },
      { status: 500 }
    )
  }
}
