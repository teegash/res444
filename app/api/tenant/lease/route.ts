import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        start_date,
        end_date,
        monthly_rent,
        deposit_amount,
        processing_fee,
        water_deposit,
        electricity_deposit,
        status,
        lease_agreement_url,
        rent_auto_populated,
        rent_locked_reason,
        lease_auto_generated,
        created_at,
        updated_at,
        unit:apartment_units (
          id,
          unit_number,
          floor,
          number_of_bedrooms,
          number_of_bathrooms,
          size_sqft,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending', 'renewed'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    if (!lease) {
      return NextResponse.json({ success: true, data: null })
    }

    return NextResponse.json({ success: true, data: lease })
  } catch (error) {
    console.error('[TenantLease] Failed to fetch lease', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch lease.',
      },
      { status: 500 }
    )
  }
}
