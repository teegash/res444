import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPeriodRange } from '../utils'

type StatementRow = {
  property: string
  property_id: string | null
  month: string | null
  income: number
  expenses: number
}

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'quarter'
    const propertyFilter = request.nextUrl.searchParams.get('property') || 'all'
    const { startDate } = getPeriodRange(period)
    const admin = createAdminClient()

    const paymentsQuery = admin
      .from('payments')
      .select(
        `
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
      paymentsQuery.gte('payment_date', startDate)
    }

    const { data: payments, error: paymentsError } = await paymentsQuery
    if (paymentsError) throw paymentsError

    const rows: StatementRow[] = (payments || []).map((payment) => {
      const building = payment.invoices?.leases?.unit?.building
      const date = payment.payment_date ? new Date(payment.payment_date) : null
      const monthLabel = date
        ? date.toLocaleString('default', { month: 'short', year: 'numeric' })
        : null
      return {
        property: building?.name || 'Property',
        property_id: building?.id || null,
        month: monthLabel,
        income: Number(payment.amount_paid || 0),
        expenses: 0,
      }
    })

    const filtered =
      propertyFilter === 'all'
        ? rows
        : rows.filter((row) => row.property === propertyFilter || row.property_id === propertyFilter)

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('[Reports.Financial] Failed to load financial statement', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load financial statement.' },
      { status: 500 }
    )
  }
}
