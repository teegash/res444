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

    const waterBills = data || []
    const unitIds = Array.from(new Set(waterBills.map((row) => row.unit?.id).filter(Boolean))) as string[]

    let unitLeaseMap = new Map<
      string,
      {
        lease_id: string
        tenant_user_id: string | null
      }
    >()

    if (unitIds.length > 0) {
      const { data: leaseRows } = await admin
        .from('leases')
        .select('id, unit_id, tenant_user_id, status, start_date')
        .in('unit_id', unitIds)
        .in('status', ['active', 'pending'])
        .order('start_date', { ascending: false })

      if (leaseRows) {
        for (const leaseRow of leaseRows) {
          if (!leaseRow.unit_id) continue
          if (!unitLeaseMap.has(leaseRow.unit_id)) {
            unitLeaseMap.set(leaseRow.unit_id, {
              lease_id: leaseRow.id,
              tenant_user_id: leaseRow.tenant_user_id,
            })
          }
        }
      }
    }

    const tenantIds = Array.from(
      new Set(
        Array.from(unitLeaseMap.values())
          .map((item) => item.tenant_user_id)
          .filter(Boolean)
      )
    ) as string[]

    let tenantProfileMap = new Map<
      string,
      { name: string; email: string | null; phone_number: string | null }
    >()

    if (tenantIds.length > 0) {
      const { data: tenantProfiles } = await admin
        .from('user_profiles')
        .select('id, full_name, email, phone_number')
        .in('id', tenantIds)

      tenantProfiles?.forEach((profile) => {
        tenantProfileMap.set(profile.id, {
          name: profile.full_name || 'Tenant',
          email: profile.email || null,
          phone_number: profile.phone_number || null,
        })
      })
    }

    const items = waterBills.map((row) => {
      const building = row.unit?.apartment_buildings
      const invoice = row.invoice
      const isPaid = Boolean(invoice?.status)
      const leaseInfo = row.unit?.id ? unitLeaseMap.get(row.unit.id) : null
      const tenantInfo =
        leaseInfo?.tenant_user_id ? tenantProfileMap.get(leaseInfo.tenant_user_id) : null

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
        unit_id: row.unit?.id || null,
        unit_number: row.unit?.unit_number || '—',
        tenant_id: leaseInfo?.tenant_user_id || null,
        tenant_name: tenantInfo?.name || 'Unassigned tenant',
        tenant_phone: tenantInfo?.phone_number || null,
        tenant_email: tenantInfo?.email || null,
        invoice_due_date: invoice?.due_date || null,
        invoice_id: invoice?.id || null,
        status: isPaid ? 'paid' : 'unpaid',
      }
    })

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
