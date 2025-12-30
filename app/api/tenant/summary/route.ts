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

function parseDateOnly(value?: string | null) {
  if (!value) return null
  const raw = value.trim()
  const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
  const [y, m, d] = base.split('-').map((part) => Number(part))
  if (y && m && d) {
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function monthsBetweenUtc(start: Date, end: Date) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
}

function lastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0))
}

function addMonthsPreserveDayUtc(date: Date, months: number) {
  const startDay = date.getUTCDate()
  const rawMonth = date.getUTCMonth() + months
  const year = date.getUTCFullYear() + Math.floor(rawMonth / 12)
  const monthIndex = ((rawMonth % 12) + 12) % 12
  const lastDay = lastDayOfMonthUtc(year, monthIndex).getUTCDate()
  const day = Math.min(startDay, lastDay)
  return new Date(Date.UTC(year, monthIndex, day))
}

function toIsoDate(value: Date | null) {
  if (!value) return null
  return value.toISOString().slice(0, 10)
}

function deriveRenewalDates(start?: string | null, end?: string | null) {
  const leaseStart = parseDateOnly(start)
  const leaseEnd = parseDateOnly(end)
  if (!leaseEnd) return { start: null, end: null }
  const termMonthsRaw = leaseStart && leaseEnd ? monthsBetweenUtc(leaseStart, leaseEnd) : 0
  const termMonths = termMonthsRaw > 0 ? termMonthsRaw : 12
  const renewalStart = addDaysUtc(leaseEnd, 1)
  const renewalEnd =
    termMonths % 12 === 0
      ? addMonthsPreserveDayUtc(renewalStart, termMonths)
      : lastDayOfMonthUtc(renewalStart.getUTCFullYear(), renewalStart.getUTCMonth() + termMonths - 1)
  return { start: toIsoDate(renewalStart), end: toIsoDate(renewalEnd) }
}

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
      .select('id, full_name, phone_number, profile_picture_url, address, organization_id')
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
        organization_id,
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
      .in('status', ['active', 'pending', 'renewed', 'expired'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    let effectiveStartDate = lease?.start_date ?? null
    let effectiveEndDate = lease?.end_date ?? null
    let effectiveStatus = lease?.status ?? null

    if (lease?.id) {
      const { data: completedRenewal } = await adminSupabase
        .from('lease_renewals')
        .select('id, proposed_start_date, proposed_end_date, created_at')
        .eq('lease_id', lease.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (completedRenewal) {
        const derived = deriveRenewalDates(lease.start_date, lease.end_date)
        effectiveStartDate = completedRenewal.proposed_start_date || derived.start || effectiveStartDate
        effectiveEndDate = completedRenewal.proposed_end_date || derived.end || effectiveEndDate

        const startDate = effectiveStartDate ? parseDateOnly(effectiveStartDate) : null
        if (startDate) {
          const today = new Date()
          effectiveStatus = startDate > today ? 'renewed' : lease.status
        }
      }
    }

    const monthlyRent = lease
      ? parseCurrency(lease.unit?.unit_price_category, lease.monthly_rent)
      : null

    let ratingPercentage: number | null = null
    let scoredItemsCount = 0
    let ratingQuery = adminSupabase
      .from('vw_tenant_payment_timeliness')
      .select('rating_percentage, scored_items_count')
      .eq('tenant_user_id', user.id)

    const orgId = profile?.organization_id || lease?.organization_id
    if (orgId) {
      ratingQuery = ratingQuery.eq('organization_id', orgId)
    }

    const { data: ratingRow } = await ratingQuery.maybeSingle()

    if (ratingRow) {
      ratingPercentage =
        ratingRow.rating_percentage === null || ratingRow.rating_percentage === undefined
          ? null
          : Number(ratingRow.rating_percentage)
      scoredItemsCount = Number(ratingRow.scored_items_count || 0)
    }

    const unitLabel =
      lease?.unit?.unit_number && lease?.unit?.building?.name
        ? `${lease.unit.unit_number} • ${lease.unit.building.name}`
        : lease?.unit?.unit_number || null

    // Compute prepaid counts and paid-through
    let prepaidMonths = 0
    let paidUpToDate: string | null = null

    if (lease?.id) {
      const { count } = await adminSupabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .or('status.eq.true,status.eq.paid')

      if (typeof count === 'number') {
        prepaidMonths = count
      }

      const { data: latestPaid } = await adminSupabase
        .from('invoices')
        .select('due_date')
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .or('status.eq.true,status.eq.paid')
        .order('due_date', { ascending: false })
        .limit(1)

      if (latestPaid?.length && latestPaid[0]?.due_date) {
        paidUpToDate = latestPaid[0].due_date
      }
    }

    const payload = {
      profile: profile || null,
      rating: {
        rating_percentage: ratingPercentage,
        scored_items_count: scoredItemsCount,
      },
      lease: lease
        ? {
            id: lease.id,
            status: effectiveStatus,
            start_date: effectiveStartDate,
            end_date: effectiveEndDate,
            monthly_rent: monthlyRent,
            unit_number: lease.unit?.unit_number || null,
            unit_label: unitLabel,
            property_name: lease.unit?.building?.name || null,
            property_location: lease.unit?.building?.location || null,
            unit_price_text: lease.unit?.unit_price_category || null,
            rent_paid_until: lease.rent_paid_until || null,
            next_rent_due_date: lease.next_rent_due_date || null,
            prepaid_months: prepaidMonths,
            paid_up_to_date: paidUpToDate,
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
