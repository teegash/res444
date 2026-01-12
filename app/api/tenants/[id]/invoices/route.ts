import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc } from '@/lib/invoices/rentPeriods'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function GET(request: Request, ctx: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = String(ctx?.params?.id || '').trim()
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const role = String(membership?.role || '').toLowerCase()
    if (!MANAGER_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: tenantProfile, error: tenantError } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, organization_id')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantError || !tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant not found.' }, { status: 404 })
    }

    if (tenantProfile.organization_id !== membership.organization_id) {
      return NextResponse.json({ success: false, error: 'Tenant not found in your organization.' }, { status: 404 })
    }

    const { data: leases, error: leaseError } = await admin
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
      .eq('organization_id', membership.organization_id)
      .eq('tenant_user_id', tenantId)

    if (leaseError) {
      return NextResponse.json({ success: false, error: leaseError.message }, { status: 500 })
    }

    if (!leases || leases.length === 0) {
      return NextResponse.json({ success: true, tenant: tenantProfile, data: [] })
    }

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

    const leaseIds = leases.map((lease) => lease.id)

    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select('id, lease_id, amount, due_date, status, status_text, invoice_type, description, created_at, months_covered')
      .in('lease_id', leaseIds)
      .order('due_date', { ascending: false })

    if (invoiceError) {
      return NextResponse.json({ success: false, error: invoiceError.message }, { status: 500 })
    }

    const payload = (invoices || []).map((invoice) => {
      const leaseMeta = leaseMap.get(invoice.lease_id as string)
      const building = leaseMeta?.building
      const rentPaidUntilDate = leaseMeta?.rent_paid_until ? new Date(leaseMeta.rent_paid_until) : null
      const dueDateObj = invoice.due_date ? new Date(invoice.due_date) : null
      const eligibleStart = leaseMeta?.eligible_start ? new Date(leaseMeta.eligible_start) : null
      const isCovered =
        rentPaidUntilDate !== null &&
        dueDateObj !== null &&
        !Number.isNaN(dueDateObj.getTime()) &&
        dueDateObj.getTime() <= rentPaidUntilDate.getTime()
      const isPreStart =
        eligibleStart !== null &&
        dueDateObj !== null &&
        !Number.isNaN(dueDateObj.getTime()) &&
        startOfMonthUtc(dueDateObj) < startOfMonthUtc(eligibleStart)

      const rawStatus = invoice.status_text ?? invoice.status
      const normalizedPaid =
        rawStatus === true ||
        rawStatus === 'paid' ||
        rawStatus === 'verified' ||
        rawStatus === 'settled'

      const statusValue = isCovered || isPreStart || normalizedPaid ? true : false

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
        raw_status: rawStatus ?? null,
      }
    })

    return NextResponse.json({ success: true, tenant: tenantProfile, data: payload })
  } catch (error) {
    console.error('[Tenants.Invoices] Failed to load invoices', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load invoices.' },
      { status: 500 }
    )
  }
}
