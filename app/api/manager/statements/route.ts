import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPeriodRange } from '../reports/utils'

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || 'all'
    const propertyId = request.nextUrl.searchParams.get('propertyId') || null
    const search = (request.nextUrl.searchParams.get('q') || '').toLowerCase()
    const { startDate } = getPeriodRange(period)

    const admin = createAdminClient()

    const paymentsQuery = admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_date,
        payment_method,
        mpesa_receipt_number,
        tenant_user_id,
        invoices:invoice_id (
          id,
          lease_id,
          leases:lease_id (
            tenant_user_id,
            unit:apartment_units (
              unit_number,
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

    const { data, error } = await paymentsQuery
    if (error) {
      throw error
    }

    const tenantIds = Array.from(
      new Set(
        (data || [])
          .map((row) => row.tenant_user_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    let profileMap = new Map<string, string>()
    if (tenantIds.length > 0) {
      const { data: profiles, error: profileError } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .in('id', tenantIds)
      if (profileError) throw profileError
      profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name || 'Tenant']))
    }

    const rows = (data || [])
      .map((row) => {
        const building = row.invoices?.leases?.unit?.building
        const unitNumber = row.invoices?.leases?.unit?.unit_number || ''
        const tenantName =
          profileMap.get(row.tenant_user_id || '') ||
          row.invoices?.leases?.tenant_user_id ||
          row.tenant_user_id ||
          'Tenant'
        const unitLabel = unitNumber && building?.name ? `${unitNumber} • ${building.name}` : unitNumber || ''
        return {
          id: row.id,
          tenantName,
          propertyId: building?.id || null,
          propertyName: building?.name || 'Property',
          propertyLocation: building?.location || null,
          unitLabel,
          amount: Number(row.amount_paid || 0),
          paymentDate: row.payment_date,
          method: row.payment_method || 'payment',
          receipt: row.mpesa_receipt_number || null,
        }
      })
      .filter((row) => {
        if (propertyId && propertyId !== 'all' && row.propertyId !== propertyId) return false
        if (search) {
          const haystack = `${row.tenantName} ${row.propertyName} ${row.unitLabel}`.toLowerCase()
          return haystack.includes(search)
        }
        return true
      })

    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    console.error('[ManagerStatements] Failed to load statements', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load statements.' },
      { status: 500 }
    )
  }
}
