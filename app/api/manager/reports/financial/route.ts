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
    const { startDate, endDate } = getPeriodRange(period)
    const admin = createAdminClient()

    const paymentsQuery = admin
      .from('payments')
      .select(
        `
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
      .order('payment_date', { ascending: false })

    if (startDate) {
      paymentsQuery.gte('payment_date', startDate)
    }

    const { data: payments, error: paymentsError } = await paymentsQuery
    if (paymentsError) throw paymentsError

    let expenses: any[] = []
    try {
      const expensesQuery = admin
        .from('expenses')
        .select(
          `
          id,
          amount,
          incurred_at,
          property_id,
          category,
          apartment_buildings ( id, name, location )
        `
        )

      if (startDate) {
        expensesQuery.gte('incurred_at', startDate)
      }
      if (endDate) {
        expensesQuery.lte('incurred_at', endDate)
      }
      if (propertyFilter && propertyFilter !== 'all') {
        expensesQuery.eq('property_id', propertyFilter)
      }

      const { data: expensesData } = await expensesQuery
      expenses = expensesData || []
    } catch (err) {
      // If expenses table doesn't exist, ignore and return income only
    }

    const rows: StatementRow[] = [
      ...(payments || []).map((payment) => {
        const building = payment.invoice?.lease?.unit?.building
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
      }),
      ...expenses.map((expense) => {
        const building = expense.apartment_buildings
        const date = expense.incurred_at ? new Date(expense.incurred_at) : null
        const monthLabel = date
          ? date.toLocaleString('default', { month: 'short', year: 'numeric' })
          : null
        return {
          property: building?.name || 'Property',
          property_id: building?.id || expense.property_id || null,
          month: monthLabel,
          income: 0,
          expenses: Number(expense.amount || 0),
        }
      }),
    ]

    const scoped =
      propertyFilter === 'all'
        ? rows
        : rows.filter((row) => row.property === propertyFilter || row.property_id === propertyFilter)

    const aggregates = new Map<
      string,
      { property: string; property_id: string | null; month: string | null; income: number; expenses: number }
    >()

    scoped.forEach((row) => {
      const key = `${row.property_id || row.property || 'property'}|${row.month || 'unknown'}`
      const existing = aggregates.get(key) || {
        property: row.property,
        property_id: row.property_id,
        month: row.month,
        income: 0,
        expenses: 0,
      }
      existing.income += row.income || 0
      existing.expenses += row.expenses || 0
      aggregates.set(key, existing)
    })

    const aggregatedRows = Array.from(aggregates.values())

    return NextResponse.json({ success: true, data: aggregatedRows })
  } catch (error) {
    console.error('[Reports.Financial] Failed to load financial statement', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load financial statement.' },
      { status: 500 }
    )
  }
}
