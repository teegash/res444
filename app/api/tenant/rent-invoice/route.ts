import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc, addMonthsUtc, toIsoDate, rentDueDateForPeriod } from '@/lib/invoices/rentPeriods'

// Helper to format description
const describe = (period: Date) =>
  `Rent for ${period.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`

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

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }
    const { data: lease, error: leaseError } = await admin
      .from('leases')
      .select(
        `
        id,
        organization_id,
        monthly_rent,
        rent_paid_until,
        next_rent_due_date,
        start_date,
        unit:apartment_units (
          id,
          unit_number,
          organization_id,
          building:apartment_buildings (
            id,
            name,
            location,
            organization_id
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) throw leaseError
    if (!lease) {
      return NextResponse.json({ success: false, error: 'No active lease found for rent payment.' }, { status: 404 })
    }

    // Some older rows might have a missing lease.organization_id; derive it from the unit/building and heal the row.
    const derivedOrgId =
      lease.organization_id ||
      (lease.unit as any)?.organization_id ||
      (lease.unit as any)?.building?.organization_id ||
      null
    if (!derivedOrgId) {
      return NextResponse.json(
        { success: false, error: 'Lease organization is missing. Please contact support.' },
        { status: 422 }
      )
    }
    if (!lease.organization_id) {
      await admin.from('leases').update({ organization_id: derivedOrgId }).eq('id', lease.id)
      ;(lease as any).organization_id = derivedOrgId
    }

    const monthlyRent = lease.monthly_rent
    if (typeof monthlyRent !== 'number' || Number.isNaN(monthlyRent)) {
      return NextResponse.json({ success: false, error: 'Monthly rent is not configured for your lease.' }, { status: 422 })
    }

    const today = startOfMonthUtc(new Date())

    // Lease eligibility (first full month; if start_date after day 1, push to next month)
    let leaseEligibleStart: Date | null = null
    if (lease.start_date) {
      const leaseStart = new Date(lease.start_date)
      if (!Number.isNaN(leaseStart.getTime())) {
        const startMonth = startOfMonthUtc(leaseStart)
        leaseEligibleStart = leaseStart.getUTCDate() > 1 ? addMonthsUtc(startMonth, 1) : startMonth
      }
    }

    // If the lease pointer is before the eligible start month, bump it forward so future allocations/RPCs start correctly.
    if (leaseEligibleStart) {
      const currentPtr = lease.next_rent_due_date ? startOfMonthUtc(new Date(lease.next_rent_due_date)) : null
      if (!currentPtr || currentPtr < leaseEligibleStart) {
        await admin
          .from('leases')
          .update({ next_rent_due_date: toIsoDate(leaseEligibleStart) })
          .eq('id', lease.id)
      }
    }

    // 1. Prefer oldest unpaid rent invoice (enterprise rule)
    const { data: unpaidInvoice } = await admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        period_start,
        due_date,
        status,
        status_text,
        invoice_type,
        description,
        months_covered,
        lease:leases (
          id,
          rent_paid_until,
          unit:apartment_units (
            unit_number,
            building:apartment_buildings (
              name,
              location
            )
          )
        )
      `
      )
      .eq('lease_id', lease.id)
      .eq('invoice_type', 'rent')
      .or('status.eq.false,status_text.eq.unpaid,status_text.eq.overdue,status_text.eq.partially_paid,status_text.is.null')
      .order('period_start', { ascending: true })
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (unpaidInvoice?.id) {
      const transformedInvoice = {
        ...unpaidInvoice,
        property_name: unpaidInvoice?.lease?.unit?.building?.name || null,
        property_location: unpaidInvoice?.lease?.unit?.building?.location || null,
        unit_label: unpaidInvoice?.lease?.unit?.unit_number || null,
        lease: {
          rent_paid_until: unpaidInvoice?.lease?.rent_paid_until || null,
        },
      }
      return NextResponse.json({
        success: true,
        data: {
          invoice: transformedInvoice,
        },
      })
    }

    // 2. Determine next rent period (month identity) when none are unpaid
    const pointer = lease.next_rent_due_date ? startOfMonthUtc(new Date(lease.next_rent_due_date)) : today
    let nextDue = pointer
    if (lease.rent_paid_until) {
      const paidUntil = startOfMonthUtc(new Date(lease.rent_paid_until))
      if (paidUntil >= nextDue) {
        nextDue = addMonthsUtc(paidUntil, 1)
      }
    }
    if (leaseEligibleStart && nextDue < leaseEligibleStart) {
      nextDue = leaseEligibleStart
    }

    let attempts = 0
    while (attempts < 6) {
      const periodStartIso = toIsoDate(nextDue)
      const dueDateIso = rentDueDateForPeriod(nextDue)

      // 3. Check if invoice exists for this month
      const { data: existing } = await admin
        .from('invoices')
        .select(`
          id,
          amount,
          period_start,
          due_date,
          status,
          status_text,
          invoice_type,
          description,
          months_covered,
          lease:leases (
            id,
            rent_paid_until,
            unit:apartment_units (
              unit_number,
              building:apartment_buildings (
                name,
                location
              )
            )
          )
        `)
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .eq('period_start', periodStartIso)
        .maybeSingle()

      if (existing) {
        const transformedInvoice = {
          ...existing,
          property_name: existing?.lease?.unit?.building?.name || null,
          property_location: existing?.lease?.unit?.building?.location || null,
          unit_label: existing?.lease?.unit?.unit_number || null,
          lease: {
            rent_paid_until: existing?.lease?.rent_paid_until || null,
          },
        }
        return NextResponse.json({
          success: true,
          data: {
            invoice: transformedInvoice,
          },
        })
      }

      // 4. Create the invoice (safe upsert)
      const { data: created, error: createError } = await admin
        .from('invoices')
        .upsert(
          {
            lease_id: lease.id,
            organization_id: lease.organization_id,
            invoice_type: 'rent',
            amount: monthlyRent,
            due_date: dueDateIso,
            period_start: periodStartIso,
            months_covered: 1,
            status: false,
            status_text: 'unpaid',
            description: describe(nextDue),
          },
          { returning: 'representation', onConflict: 'lease_id,invoice_type,period_start' }
        )
        .select()
        .single()

      if (createError) {
        console.error('[RentInvoice] Insert error', createError.code, createError.message)
        if (createError.code === '23505') {
          attempts += 1
          continue
        }
        return NextResponse.json({ success: false, error: 'Unable to prepare rent invoice.' }, { status: 500 })
      }

      if (!created || !created.id) {
        console.error('[RentInvoice] Upsert returned null data', created)
        return NextResponse.json(
          { success: false, error: 'Invoice creation failed (null returned).' },
          { status: 500 }
        )
      }

      const property = lease.unit?.building
      const { data: fullInvoice } = await admin
        .from('invoices')
        .select(`
          id,
          amount,
          period_start,
          due_date,
          status,
          status_text,
          invoice_type,
          description,
          months_covered,
          lease_id,
          lease:leases (
            id,
            unit:apartment_units (
              unit_number,
              unit_label:unit_number,
              building:apartment_buildings (
                name,
                location
              )
            )
          )
        `)
        .eq('id', created.id)
        .maybeSingle()
      if (!fullInvoice || !fullInvoice.id) {
        console.error('[RentInvoice] Failed to fetch full invoice after upsert')
        return NextResponse.json(
          { success: false, error: 'Unable to prepare rent invoice.' },
          { status: 500 }
        )
      }

      const transformedInvoice = {
        ...fullInvoice,
        property_name: fullInvoice?.lease?.unit?.building?.name || null,
        property_location: fullInvoice?.lease?.unit?.building?.location || null,
        unit_label: fullInvoice?.lease?.unit?.unit_number || null,
      }
      return NextResponse.json({
        success: true,
        data: {
          invoice: transformedInvoice,
        },
      })
    }

    return NextResponse.json({ success: false, error: 'Unable to prepare rent invoice.' }, { status: 500 })
  } catch (error) {
    console.error('[RentInvoice] Failed to prepare rent invoice', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to prepare rent invoice.' },
      { status: 500 }
    )
  }
}
