import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc, addMonthsUtc, toIsoDate } from '@/lib/invoices/rentPeriods'

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
        monthly_rent,
        rent_paid_until,
        next_rent_due_date,
        start_date,
        unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name,
            location
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

    // Clean pre-start invoices
    if (leaseEligibleStart) {
      await admin
        .from('invoices')
        .update({ status: true })
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .lt('due_date', toIsoDate(leaseEligibleStart))
    }

    // 1. Determine next due month
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
      const dueDateIso = toIsoDate(nextDue)

      // 2. Check if invoice exists for this month
      const { data: existing } = await admin
        .from('invoices')
        .select(`
          id,
          amount,
          due_date,
          status,
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
        .eq('due_date', dueDateIso)
        .maybeSingle()

      if (existing) {
        const coveredMonths = Number(existing.months_covered || 1)
        if (existing.status === true || coveredMonths > 1) {
          // advance to month after coverage
          nextDue = addMonthsUtc(nextDue, coveredMonths)
          attempts += 1
          continue
        }
        // pending/failed/unverified: return same invoice
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

      // 3. Create the invoice (safe upsert)
      const { data: created, error: createError } = await admin
        .from('invoices')
        .upsert(
          {
            lease_id: lease.id,
            invoice_type: 'rent',
            amount: monthlyRent,
            due_date: dueDateIso,
            months_covered: 1,
            status: false,
            description: describe(nextDue),
          },
          { returning: 'representation', onConflict: 'lease_id,invoice_type,due_date' }
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

      // advance lease pointer to month after this invoice
      const nextPointer = addMonthsUtc(nextDue, 1)
      await admin.from('leases').update({ next_rent_due_date: toIsoDate(nextPointer) }).eq('id', lease.id)

      const property = lease.unit?.building
      const { data: fullInvoice } = await admin
        .from('invoices')
        .select(`
          id,
          amount,
          due_date,
          status,
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
          lease: {
            monthly_rent: monthlyRent,
            rent_paid_until: lease.rent_paid_until,
            next_rent_due_date: nextPointer.toISOString(),
          },
          coverage_note: null,
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
