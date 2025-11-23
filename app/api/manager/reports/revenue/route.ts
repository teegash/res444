import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPeriodRange } from '../utils'

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'quarter'
    const propertyFilter = request.nextUrl.searchParams.get('property') || 'all'
    const { startDate } = getPeriodRange(period)
    const admin = createAdminClient()

    const query = admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_date,
        invoices:invoice_id (
          lease_id,
          leases:lease_id (
            unit:apartment_units (
              building:apartment_buildings (
                id,
                name,
                location
              )
            )
          )
        )
      `
      )
      .order('payment_date', { ascending: false })

    if (startDate) {
      query.gte('payment_date', startDate)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    const rows = (data || []).filter((row) => {
      const building = row.invoices?.leases?.unit?.building
      if (propertyFilter === 'all') return true
      return building?.name === propertyFilter || building?.id === propertyFilter
    })

    const mapped = rows.map((row) => ({
      id: row.id,
      property: row.invoices?.leases?.unit?.building?.name || 'Property',
      propertyId: row.invoices?.leases?.unit?.building?.id || null,
      location: row.invoices?.leases?.unit?.building?.location || null,
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
