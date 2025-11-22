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
          amount,
          lease_id
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

    const unitLeaseMap = new Map<string, { lease_id: string; tenant_user_id: string | null }>()
    const leaseById = new Map<string, { lease_id: string; tenant_user_id: string | null }>()

    const registerLease = (leaseRow?: { id?: string; unit_id?: string | null; tenant_user_id?: string | null }) => {
      if (!leaseRow?.id) return
      const summary = {
        lease_id: leaseRow.id,
        tenant_user_id: leaseRow.tenant_user_id ?? null,
      }

      leaseById.set(summary.lease_id, summary)

      if (leaseRow.unit_id && !unitLeaseMap.has(leaseRow.unit_id)) {
        unitLeaseMap.set(leaseRow.unit_id, summary)
      }
    }

    if (unitIds.length > 0) {
      const { data: leaseRows } = await admin
        .from('leases')
        .select('id, unit_id, tenant_user_id, status, start_date')
        .in('unit_id', unitIds)
        .order('start_date', { ascending: false })

      leaseRows?.forEach(registerLease)
    }

    const invoiceLeaseIds = Array.from(
      new Set(
        waterBills
          .map((row) => row.invoice?.lease_id)
          .filter((leaseId): leaseId is string => Boolean(leaseId))
      )
    )

    const missingLeaseIds = invoiceLeaseIds.filter((leaseId) => !leaseById.has(leaseId))

    if (missingLeaseIds.length > 0) {
      const { data: invoiceLeases } = await admin
        .from('leases')
        .select('id, unit_id, tenant_user_id, status, start_date')
        .in('id', missingLeaseIds)

      invoiceLeases?.forEach(registerLease)
    }

    const tenantIdSet = new Set<string>()
    unitLeaseMap.forEach((value) => {
      if (value.tenant_user_id) {
        tenantIdSet.add(value.tenant_user_id)
      }
    })
    leaseById.forEach((value) => {
      if (value.tenant_user_id) {
        tenantIdSet.add(value.tenant_user_id)
      }
    })

    const tenantIds = Array.from(tenantIdSet)

    let tenantProfileMap = new Map<
      string,
      { name: string; email: string | null; phone_number: string | null }
    >()

    if (tenantIds.length > 0) {
      const { data: tenantProfiles } = await admin
        .from('user_profiles')
        .select('id, full_name, email, phone_number, role')
        .in('id', tenantIds)

      tenantProfiles?.forEach((profile) => {
        if (profile.role && profile.role !== 'tenant') {
          return
        }
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
      const leaseFromUnit = row.unit?.id ? unitLeaseMap.get(row.unit.id) : null
      const leaseFromInvoice = invoice?.lease_id ? leaseById.get(invoice.lease_id) : null
      const leaseInfo = leaseFromUnit ?? leaseFromInvoice
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
