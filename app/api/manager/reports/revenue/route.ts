import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPeriodRange } from '../utils'

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'quarter'
    const propertyFilter = request.nextUrl.searchParams.get('property') || 'all'
    const { startDate } = getPeriodRange(period)

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

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id

    const query = admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_date,
        invoice:invoices!payments_invoice_org_fk (
          lease_id,
          lease:leases!invoices_lease_org_fk (
            unit:apartment_units (
              building:apartment_buildings!apartment_units_building_org_fk (
                id,
                name,
                location
              )
            )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .order('payment_date', { ascending: false })

    if (startDate) {
      query.gte('payment_date', startDate)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    const rows = (data || []).filter((row) => {
      const building = row.invoice?.lease?.unit?.building
      if (propertyFilter === 'all') return true
      return building?.name === propertyFilter || building?.id === propertyFilter
    })

    const mapped = rows.map((row) => ({
      id: row.id,
      property: row.invoice?.lease?.unit?.building?.name || 'Property',
      propertyId: row.invoice?.lease?.unit?.building?.id || null,
      location: row.invoice?.lease?.unit?.building?.location || null,
      amount: Number(row.amount_paid || 0),
      payment_date: row.payment_date,
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error('[Reports.Revenue] Failed to load revenue report', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load revenue report.' },
      { status: 500 }
    )
  }
}
