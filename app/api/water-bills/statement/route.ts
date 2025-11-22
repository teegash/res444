import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type SupabaseWaterBillRow = {
  id: string
  billing_month: string | null
  amount: number | null
  status: string | null
  units_consumed: number | null
  notes: string | null
  created_at: string | null
  unit: {
    id: string
    unit_number: string | null
    building_id: string | null
    apartment_buildings: {
      id: string
      name: string | null
      location: string | null
    } | null
  } | null
  invoice: {
    id: string
    status: boolean | null
    due_date: string | null
    amount: number | null
  } | null
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

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('water_bills')
      .select(
        `
        id,
        billing_month,
        amount,
        status,
        units_consumed,
        notes,
        created_at,
        unit:apartment_units!inner (
          id,
          unit_number,
          building_id,
          apartment_buildings (
            id,
            name,
            location
          )
        ),
        invoice:invoices (
          id,
          status,
          due_date,
          amount
        )
      `
      )
      .order('billing_month', { ascending: false })
      .limit(500)

    if (error) {
      throw error
    }

    const items = (data as SupabaseWaterBillRow[] | null)?.map((row) => {
      const building = row.unit?.apartment_buildings
      const invoice = row.invoice
      const isPaid = Boolean(invoice?.status)
      return {
        id: row.id,
        billing_month: row.billing_month,
        amount: Number(row.amount || 0),
        units_consumed: row.units_consumed ? Number(row.units_consumed) : null,
        notes: row.notes,
        created_at: row.created_at,
        property_id: building?.id || row.unit?.building_id || null,
        property_name: building?.name || 'Unassigned',
        property_location: building?.location || '—',
        unit_number: row.unit?.unit_number || '—',
        invoice_due_date: invoice?.due_date || null,
        invoice_id: invoice?.id || null,
        status: isPaid ? 'paid' : 'unpaid',
      }
    }) || []

    const paidCount = items.filter((item) => item.status === 'paid').length
    const unpaidCount = items.filter((item) => item.status === 'unpaid').length
    const paidAmount = items
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + item.amount, 0)
    const unpaidAmount = items
      .filter((item) => item.status === 'unpaid')
      .reduce((sum, item) => sum + item.amount, 0)

    const propertiesMap = new Map<string, { id: string; name: string; location: string }>()
    items.forEach((item) => {
      if (item.property_id && !propertiesMap.has(item.property_id)) {
        propertiesMap.set(item.property_id, {
          id: item.property_id,
          name: item.property_name || 'Unassigned',
          location: item.property_location || '—',
        })
      }
    })

    return NextResponse.json({
      success: true,
      data: items,
      summary: {
        total: items.length,
        paid_count: paidCount,
        unpaid_count: unpaidCount,
        paid_amount: paidAmount,
        unpaid_amount: unpaidAmount,
      },
      properties: Array.from(propertiesMap.values()),
    })
  } catch (error) {
    console.error('[WaterBills.Statement] Failed to fetch statements', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch water bill statements.',
      },
      { status: 500 }
    )
  }
}
