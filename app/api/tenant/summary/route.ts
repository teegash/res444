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
            rent_paid_until: lease.rent_paid_until || null,
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
