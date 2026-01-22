import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMonthsUtc, startOfMonthUtc, toIsoDate } from '@/lib/invoices/rentPeriods'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

function addMonthsToDate(startDate: string, months: number) {
  const date = new Date(startDate)
  if (Number.isNaN(date.getTime())) return null
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result.toISOString().split('T')[0]
}

function deriveLeaseStatus(lease: any) {
  if (!lease) {
    return { status: 'unassigned', detail: 'No lease on file.' }
  }
  const today = new Date()
  const start = lease.start_date ? new Date(lease.start_date) : null
  const end = lease.end_date ? new Date(lease.end_date) : null

  if (start && start <= today && (!end || end >= today)) {
    return { status: 'valid', detail: 'Lease is currently active.' }
  }
  if (end && end < today) {
    return { status: 'expired', detail: `Lease ended on ${end.toLocaleDateString()}.` }
  }
  if (start && start > today) {
    if ((lease.status || '').toLowerCase() === 'renewed') {
      return { status: 'renewed', detail: `Renewed lease starts on ${start.toLocaleDateString()}.` }
    }
    return { status: 'pending', detail: `Lease activates on ${start.toLocaleDateString()}.` }
  }
  return { status: lease.status || 'pending', detail: 'Lease data pending verification.' }
}

async function verifyManagerAccess() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const role = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Access denied. Manager permissions required.' },
        { status: 403 }
      ),
    }
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
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Organization not found for this user.' },
        { status: 403 }
      ),
    }
  }

  return { user, organizationId: membership.organization_id }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const url = request.nextUrl
  const tenantId = params?.id || url.searchParams.get('tenantId') || undefined
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  const auth = await verifyManagerAccess()
  if (auth.error) return auth.error

  try {
    const organizationId = (auth as any).organizationId as string
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }
    const { data: tenant, error: tenantError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url, address')
      .eq('id', tenantId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant profile not found.' },
        { status: 404 }
      )
    }

    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        tenant_user_id,
        unit_id,
        start_date,
        end_date,
        monthly_rent,
        deposit_amount,
        processing_fee,
        water_deposit,
        electricity_deposit,
        status,
        lease_agreement_url,
        organization_id,
        rent_paid_until,
        next_rent_due_date,
        unit:apartment_units (
          id,
          unit_number,
          unit_price_category,
          organization_id,
          building:apartment_buildings (
            id,
            name,
            location,
            organization_id
          )
        )
      `
      )
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    if (lease?.organization_id && lease.organization_id !== organizationId) {
      return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 })
    }

    const statusSummary = deriveLeaseStatus(lease)

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        lease,
        lease_status: statusSummary,
      },
    })
  } catch (error) {
    console.error('[TenantLease.GET] Failed to fetch lease', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load lease.' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const url = request.nextUrl
  const payload = await request.json().catch(() => ({}))
  const {
    start_date,
    duration_months,
    monthly_rent,
    deposit_amount,
    processing_fee,
    water_deposit,
    electricity_deposit,
    unit_id,
    tenant_user_id,
  } = payload || {}

  const tenantId = params?.id || url.searchParams.get('tenantId') || tenant_user_id
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  const auth = await verifyManagerAccess()
  if (auth.error) return auth.error

  try {
    const organizationId = (auth as any).organizationId as string
    if (!start_date || !duration_months) {
      return NextResponse.json(
        { success: false, error: 'Start date and lease duration are required.' },
        { status: 400 }
      )
    }

    const duration = Number(duration_months)
    if (!Number.isFinite(duration) || duration < 6) {
      return NextResponse.json(
        { success: false, error: 'Duration must be at least 6 months.' },
        { status: 400 }
      )
    }

    const ensureNonNegativeNumberOrNull = (value: any, field: string) => {
      if (value === null || value === undefined || value === '') return null
      const normalized = Number(value)
      if (!Number.isFinite(normalized)) {
        throw new Error(`${field} must be a valid number.`)
      }
      if (normalized < 0) {
        throw new Error(`${field} cannot be negative.`)
      }
      return normalized
    }

    const normalizedDepositAmount = ensureNonNegativeNumberOrNull(deposit_amount, 'Deposit amount')
    const normalizedProcessingFee = ensureNonNegativeNumberOrNull(processing_fee, 'Processing fee')
    const normalizedWaterDeposit = ensureNonNegativeNumberOrNull(water_deposit, 'Water deposit')
    const normalizedElectricityDeposit = ensureNonNegativeNumberOrNull(
      electricity_deposit,
      'Electricity deposit'
    )

    const startDateObj = new Date(`${start_date}T00:00:00.000Z`)
    if (Number.isNaN(startDateObj.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid start_date.' }, { status: 400 })
    }

    const computedEndDate = addMonthsToDate(start_date, duration)

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }

    // Ensure tenant belongs to the same org (prevents cross-org leaks with service role).
    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select('id, organization_id')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError || !tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant profile not found.' }, { status: 404 })
    }
    if (tenantProfile.organization_id !== organizationId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: existingLease, error: existingError } = await adminSupabase
      .from('leases')
      .select('id, unit_id, rent_paid_until, next_rent_due_date, organization_id')
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existingLease?.organization_id && existingLease.organization_id !== organizationId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const resolvedUnitId = unit_id || existingLease?.unit_id || null
    if (!resolvedUnitId) {
      return NextResponse.json({ success: false, error: 'unit_id is required.' }, { status: 400 })
    }

    const { data: unitRow, error: unitError } = await adminSupabase
      .from('apartment_units')
      .select('id, organization_id')
      .eq('id', resolvedUnitId)
      .maybeSingle()

    if (unitError || !unitRow) {
      return NextResponse.json({ success: false, error: 'Unit not found.' }, { status: 400 })
    }
    if (unitRow.organization_id !== organizationId) {
      return NextResponse.json({ success: false, error: 'Unit does not belong to this organization.' }, { status: 403 })
    }

    // First billable month: if start_date is after day 1, bill from next month’s 1st.
    const startMonth = startOfMonthUtc(startDateObj)
    const leaseEligibleStart = startDateObj.getUTCDate() > 1 ? addMonthsUtc(startMonth, 1) : startMonth

    const existingPtr = existingLease?.next_rent_due_date
      ? startOfMonthUtc(new Date(existingLease.next_rent_due_date))
      : null
    const nextRentDue = !existingPtr || existingPtr < leaseEligibleStart ? leaseEligibleStart : existingPtr

    const leasePayload = {
      tenant_user_id: tenantId,
      unit_id: resolvedUnitId,
      start_date,
      end_date: computedEndDate,
      monthly_rent: monthly_rent ?? null,
      deposit_amount: normalizedDepositAmount,
      processing_fee: normalizedProcessingFee,
      water_deposit: normalizedWaterDeposit,
      electricity_deposit: normalizedElectricityDeposit,
      status: new Date(start_date) <= new Date() ? 'active' : 'pending',
      organization_id: organizationId,
      next_rent_due_date: toIsoDate(nextRentDue),
    }

    let updatedLease
    if (existingLease?.id) {
      const { data, error } = await adminSupabase
        .from('leases')
        .update(leasePayload)
        .eq('id', existingLease.id)
        .select()
        .single()
      if (error) {
        throw error
      }
      updatedLease = data
    } else {
      const { data, error } = await adminSupabase.from('leases').insert(leasePayload).select().single()
      if (error) {
        throw error
      }
      updatedLease = data
    }

    if (leasePayload.unit_id) {
      await adminSupabase.from('apartment_units').update({ status: 'occupied' }).eq('id', leasePayload.unit_id)
    }

    return NextResponse.json({ success: true, data: updatedLease })
  } catch (error) {
    console.error('[TenantLease.PUT] Failed to update lease', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update lease.' },
      { status: 500 }
    )
  }
}
