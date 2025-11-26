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
    let propertyScope: string | null =
      (user.user_metadata as any)?.property_id || (user.user_metadata as any)?.building_id || null
    try {
      const { data: membership } = await admin
        .from('organization_members')
        .select('property_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (membership?.property_id) {
        propertyScope = membership.property_id
      }
    } catch {
      // ignore missing column
    }

    const waterBillQuery = admin
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
          lease_id,
          leases (
            tenant_user_id
          )
        )
      `
      )
      .order('billing_month', { ascending: false })
      .limit(500)

    if (propertyScope) {
      waterBillQuery.eq('unit.building_id', propertyScope)
    }

    const { data, error } = await waterBillQuery

    if (error) {
      throw error
    }

    const waterBills = data || []
    const unitIds = Array.from(new Set(waterBills.map((row) => row.unit?.id).filter(Boolean))) as string[]

    type LeaseSummary = {
      lease_id: string
      tenant_user_id: string | null
      unit_id: string | null
      start_date: string | null
      end_date: string | null
    }

    const leasesByUnit = new Map<string, LeaseSummary[]>()
    const leaseById = new Map<string, LeaseSummary>()

    const registerLease = (leaseRow?: {
      id?: string
      unit_id?: string | null
      tenant_user_id?: string | null
      start_date?: string | null
      end_date?: string | null
    }) => {
      if (!leaseRow?.id) return
      const summary: LeaseSummary = {
        lease_id: leaseRow.id,
        tenant_user_id: leaseRow.tenant_user_id ?? null,
        unit_id: leaseRow.unit_id ?? null,
        start_date: leaseRow.start_date ?? null,
        end_date: leaseRow.end_date ?? null,
      }

      leaseById.set(summary.lease_id, summary)

      if (summary.unit_id) {
        const list = leasesByUnit.get(summary.unit_id) || []
        list.push(summary)
        leasesByUnit.set(summary.unit_id, list)
      }
    }

    if (unitIds.length > 0) {
      const { data: leaseRows } = await admin
        .from('leases')
        .select('id, unit_id, tenant_user_id, status, start_date, end_date')
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
        .select('id, unit_id, tenant_user_id, status, start_date, end_date')
        .in('id', missingLeaseIds)

      invoiceLeases?.forEach(registerLease)
    }

    leasesByUnit.forEach((list) =>
      list.sort((a, b) => {
        const aDate = a.start_date ? new Date(a.start_date).getTime() : 0
        const bDate = b.start_date ? new Date(b.start_date).getTime() : 0
        return bDate - aDate
      })
    )

    const getLeaseForBill = (unitId: string | null | undefined, billingMonth: string | null) => {
      if (!unitId) return null
      const candidates = leasesByUnit.get(unitId)
      if (!candidates || candidates.length === 0) {
        return null
      }

      if (!billingMonth) {
        return candidates[0]
      }

      const periodStart = new Date(billingMonth)
      periodStart.setUTCHours(0, 0, 0, 0)
      const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0))

      return (
        candidates.find((lease) => {
          const leaseStart = lease.start_date ? new Date(lease.start_date) : null
          const leaseEnd = lease.end_date ? new Date(lease.end_date) : null

          if (leaseStart && leaseStart > periodEnd) {
            return false
          }
          if (leaseEnd && leaseEnd < periodStart) {
            return false
          }
          return true
        }) || candidates[0]
      )
    }

    const invoiceIds = Array.from(
      new Set(
        waterBills
          .map((row) => row.invoice?.id)
          .filter((id): id is string => Boolean(id))
      )
    )

    const invoiceTenantMap = new Map<string, string>()

    if (invoiceIds.length) {
      const { data: paymentRows } = await admin
        .from('payments')
        .select('invoice_id, tenant_user_id, verified, payment_date')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false })

      paymentRows?.forEach((row) => {
        if (!row.invoice_id || !row.tenant_user_id) return
        if (!invoiceTenantMap.has(row.invoice_id)) {
          invoiceTenantMap.set(row.invoice_id, row.tenant_user_id)
        }
      })
    }

    const invoiceLeaseTenant = new Map<string, string | null>()
    waterBills.forEach((row) => {
      if (row.invoice?.lease_id && (row.invoice as any)?.leases?.tenant_user_id) {
        invoiceLeaseTenant.set(row.invoice.lease_id, (row.invoice as any).leases.tenant_user_id)
      }
    })

    const tenantIdSet = new Set<string>()
    leasesByUnit.forEach((list) => {
      list.forEach((value) => {
        if (value.tenant_user_id) {
          tenantIdSet.add(value.tenant_user_id)
        }
      })
    })
    leaseById.forEach((value) => {
      if (value.tenant_user_id) {
        tenantIdSet.add(value.tenant_user_id)
      }
    })
    invoiceLeaseTenant.forEach((tenantId) => {
      if (tenantId) {
        tenantIdSet.add(tenantId)
      }
    })
    invoiceTenantMap.forEach((tenantId) => {
      if (tenantId) {
        tenantIdSet.add(tenantId)
      }
    })

    const tenantIds = Array.from(tenantIdSet)

    let tenantProfileMap = new Map<
      string,
      { name: string; email: string | null; phone_number: string | null }
    >()

    if (tenantIds.length > 0) {
      const baseQuery = admin
        .from('user_profiles')
        .select('id, full_name, phone_number, role')
        .in('id', tenantIds)

      let tenantProfiles: any[] | null = null
      let queryError: any = null

      // Try role-scoped fetch first (if role column exists)
      const withRole = await baseQuery.eq('role', 'tenant')
      tenantProfiles = withRole.data
      queryError = withRole.error

      // Fallback: if role column missing/error or no rows returned, fetch without role filter
      if (queryError?.message?.includes('role') || (tenantProfiles?.length ?? 0) === 0) {
        const fallback = await baseQuery
        tenantProfiles = fallback.data
        queryError = fallback.error
      }

      if (queryError) {
        console.warn('[WaterBills.Statement] tenant profile fetch warning', queryError)
      }

      tenantProfiles?.forEach((profile) => {
        tenantProfileMap.set(profile.id, {
          name: profile.full_name || 'Tenant',
          email: (profile as any).email || null,
          phone_number: profile.phone_number || null,
        })
      })
    }

    const items = waterBills.map((row) => {
      const building = row.unit?.apartment_buildings
      const invoice = row.invoice
      const isPaid = Boolean(invoice?.status)
      const leaseFromInvoice = invoice?.lease_id ? leaseById.get(invoice.lease_id) : null
      const leaseFromUnit = getLeaseForBill(row.unit?.id, row.billing_month)
      const leaseInfo = leaseFromInvoice ?? leaseFromUnit
      let tenantId = leaseInfo?.tenant_user_id || null
      if (!tenantId && invoice?.lease_id) {
        tenantId = invoiceLeaseTenant.get(invoice.lease_id) || null
      }
      if (!tenantId && invoice?.id) {
        tenantId = invoiceTenantMap.get(invoice.id) || null
      }
      const tenantInfo = tenantId ? tenantProfileMap.get(tenantId) : null

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
        tenant_id: tenantId,
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
