import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc } from '@/lib/invoices/rentPeriods'

export async function GET(request: NextRequest) {
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
    if (!adminSupabase) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }
    const { data: leases, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `id, status, tenant_user_id, rent_paid_until, start_date, unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )`
      )
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending', 'renewed'])

    if (leaseError) {
      throw leaseError
    }

    if (!leases || leases.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const leaseIds = leases.map((lease) => lease.id)
    const leaseMap = new Map(
      leases.map((lease) => {
        const leaseStartDate = lease.start_date ? new Date(lease.start_date) : null
        const leaseStartMonth = leaseStartDate
          ? new Date(Date.UTC(leaseStartDate.getUTCFullYear(), leaseStartDate.getUTCMonth(), 1))
          : null
        const leaseEligible =
          leaseStartDate && leaseStartDate.getUTCDate() > 1 && leaseStartMonth
            ? new Date(Date.UTC(leaseStartMonth.getUTCFullYear(), leaseStartMonth.getUTCMonth() + 1, 1))
            : leaseStartMonth
        return [
          lease.id,
          {
            rent_paid_until: lease.rent_paid_until || null,
            unit_number: lease.unit?.unit_number || null,
            building: lease.unit?.building || null,
            eligible_start: leaseEligible ? leaseEligible.toISOString() : null,
          },
        ]
      })
    )

    const { data: invoices, error: invoiceError } = await adminSupabase
      .from('invoices')
      .select('id, lease_id, amount, due_date, status, invoice_type, description, created_at, months_covered')
      .in('lease_id', leaseIds)
      .order('due_date', { ascending: true })

    if (invoiceError) {
      throw invoiceError
    }

    const statusFilter = request.nextUrl.searchParams.get('status')
    const payload = (invoices || []).map((invoice) => {
      const leaseMeta = leaseMap.get(invoice.lease_id as string)
      const building = leaseMeta?.building
      const isRentInvoice = String(invoice.invoice_type || 'rent').toLowerCase() === 'rent'
      const rentPaidUntilDate = leaseMeta?.rent_paid_until ? new Date(leaseMeta.rent_paid_until) : null
      const dueDateObj = invoice.due_date ? new Date(invoice.due_date) : null
      const eligibleStart = leaseMeta?.eligible_start ? new Date(leaseMeta.eligible_start) : null
      const isCovered =
        isRentInvoice &&
        rentPaidUntilDate !== null &&
        dueDateObj !== null &&
        !Number.isNaN(dueDateObj.getTime()) &&
        dueDateObj.getTime() <= rentPaidUntilDate.getTime()
      const isPreStart =
        isRentInvoice &&
        eligibleStart !== null &&
        dueDateObj !== null &&
        !Number.isNaN(dueDateObj.getTime()) &&
        startOfMonthUtc(dueDateObj) < startOfMonthUtc(eligibleStart)
      const rawStatus = invoice.status
      const normalizedPaid =
        rawStatus === true ||
        rawStatus === 'paid' ||
        rawStatus === 'verified' ||
        rawStatus === 'settled'
      const statusValue =
        isCovered || isPreStart || normalizedPaid
          ? true
          : rawStatus === false
            ? false
            : false

      return {
        id: invoice.id,
        lease_id: invoice.lease_id,
        amount: Number(invoice.amount),
        due_date: invoice.due_date,
        status: statusValue,
        invoice_type: invoice.invoice_type,
        description: invoice.description,
        created_at: invoice.created_at,
        months_covered: invoice.months_covered || 0,
        unit_label: leaseMeta?.unit_number || null,
        property_name: building?.name || null,
        property_location: building?.location || null,
        lease_paid_until: leaseMeta?.rent_paid_until || null,
        is_covered: isCovered,
        is_prestart: isPreStart,
        raw_status: rawStatus,
      }
    })

    const filteredPayload =
      statusFilter === 'pending'
        ? payload.filter((invoice) => !invoice.status && !invoice.is_covered)
        : payload

    return NextResponse.json({ success: true, data: filteredPayload })
  } catch (error) {
    console.error('[TenantInvoices.GET] Failed to load invoices', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load invoices.' },
      { status: 500 }
    )
  }
}
