import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  return { user }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = params.id
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  const auth = await verifyManagerAccess()
  if (auth.error) return auth.error

  try {
    const adminSupabase = createAdminClient()
    const { data: tenant, error: tenantError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url, address')
      .eq('id', tenantId)
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
        status,
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
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
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
  const tenantId = params.id
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  const auth = await verifyManagerAccess()
  if (auth.error) return auth.error

  try {
    const payload = await request.json().catch(() => ({}))
    const {
      start_date,
      duration_months,
      monthly_rent,
      deposit_amount,
      unit_id,
    } = payload || {}

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

    const computedEndDate = addMonthsToDate(start_date, duration)

    const adminSupabase = createAdminClient()
    const { data: existingLease, error: existingError } = await adminSupabase
      .from('leases')
      .select('id, unit_id')
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    const leasePayload = {
      tenant_user_id: tenantId,
      unit_id: unit_id || existingLease?.unit_id || null,
      start_date,
      end_date: computedEndDate,
      monthly_rent: monthly_rent ?? null,
      deposit_amount: deposit_amount ?? null,
      status: new Date(start_date) <= new Date() ? 'active' : 'pending',
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
