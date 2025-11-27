import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc, addMonthsUtc, toIsoDate } from '@/lib/invoices/rentPeriods'

const UNPAID_STATUSES = ['unpaid', 'overdue', 'partially_paid', false, null]

async function selectExistingInvoice(
  adminSupabase: ReturnType<typeof createAdminClient>,
  leaseId: string,
  periodStart: Date
) {
  const nextPeriod = addMonthsUtc(periodStart, 1)

  const { data } = await adminSupabase
    .from('invoices')
    .select('id, amount, due_date, status, invoice_type, description, months_covered, lease_id')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .gte('due_date', toIsoDate(periodStart))
    .lt('due_date', toIsoDate(nextPeriod))
    .maybeSingle()

  return data
}

async function selectByDueDate(
  adminSupabase: ReturnType<typeof createAdminClient>,
  leaseId: string,
  dueDateIso: string
) {
  const { data } = await adminSupabase
    .from('invoices')
    .select('id, amount, due_date, status, invoice_type, description, months_covered, lease_id')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .eq('due_date', dueDateIso)
    .maybeSingle()

  return data
}

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
    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        monthly_rent,
        rent_paid_until,
        next_rent_due_date,
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

    if (leaseError) {
      throw leaseError
    }

    if (!lease) {
      return NextResponse.json(
        { success: false, error: 'No active lease found for rent payment.' },
        { status: 404 }
      )
    }

    const monthlyRent = lease.monthly_rent
    if (typeof monthlyRent !== 'number' || Number.isNaN(monthlyRent)) {
      return NextResponse.json(
        { success: false, error: 'Monthly rent is not configured for your lease.' },
        { status: 422 }
      )
    }

    const today = new Date()
    const currentPeriod = startOfMonthUtc(today)

    // Latest verified rent payment to extend coverage
    const { data: latestPayment } = await adminSupabase
      .from('payments')
      .select(
        `
        months_paid,
        invoices!inner (
          due_date,
          lease_id,
          invoice_type
        )
      `
      )
      .eq('verified', true)
      .eq('invoices.invoice_type', 'rent')
      .eq('invoices.lease_id', lease.id)
      .order('invoices.due_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Latest paid invoice (captures months_covered)
    const { data: latestPaidInvoice } = await adminSupabase
      .from('invoices')
      .select('due_date, months_covered')
      .eq('lease_id', lease.id)
      .eq('invoice_type', 'rent')
      .eq('status', true)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const coveragePointers: Date[] = []
    if (latestPayment?.invoices?.due_date) {
      const coverageStart = startOfMonthUtc(new Date(latestPayment.invoices.due_date))
      const monthsPaid = Number(latestPayment.months_paid || 1)
      coveragePointers.push(addMonthsUtc(coverageStart, monthsPaid))
    }
    if (latestPaidInvoice?.due_date) {
      const paidStart = startOfMonthUtc(new Date(latestPaidInvoice.due_date))
      const monthsCovered = Number(latestPaidInvoice.months_covered || 1)
      coveragePointers.push(addMonthsUtc(paidStart, monthsCovered))
    }
    if (lease.rent_paid_until) {
      const paidUntil = new Date(lease.rent_paid_until)
      if (!Number.isNaN(paidUntil.getTime())) {
        coveragePointers.push(addMonthsUtc(startOfMonthUtc(paidUntil), 1))
      }
    }
    if (lease.next_rent_due_date) {
      const pointer = new Date(lease.next_rent_due_date)
      if (!Number.isNaN(pointer.getTime())) {
        coveragePointers.push(startOfMonthUtc(pointer))
      }
    }

    // If we have an unpaid/pending invoice, surface it first
    let targetPeriod = currentPeriod

    // Otherwise advance to the max coverage pointer vs current period
    if (!earliestUnpaid?.due_date && coveragePointers.length) {
      targetPeriod = coveragePointers.reduce((latest, d) => (d > latest ? d : latest), currentPeriod)
    }

    // Lock out covered months (1–3 month prepay) by advancing beyond coverage
    if (coveragePointers.length) {
      const maxPointer = coveragePointers.reduce((latest, d) => (d > latest ? d : latest), coveragePointers[0])
      const coveredUntil = addMonthsUtc(maxPointer, -1) // pointers represent next unpaid start
      let guard = 0
      while (targetPeriod <= coveredUntil && guard < 6) {
        targetPeriod = addMonthsUtc(targetPeriod, 1)
        guard += 1
      }
    }

    // Enforce lease start eligibility: if lease starts after day 1, first billable month is the following month
    let leaseEligibleStart: Date | null = null
    if (lease.start_date) {
      const leaseStartDate = new Date(lease.start_date)
      if (!Number.isNaN(leaseStartDate.getTime())) {
        const leaseStartMonth = startOfMonthUtc(leaseStartDate)
        leaseEligibleStart = leaseStartDate.getUTCDate() > 1 ? addMonthsUtc(leaseStartMonth, 1) : leaseStartMonth
      }
    }

    // Clean up any invoices that fall before the eligible start by marking them paid/covered
    if (leaseEligibleStart) {
      await adminSupabase
        .from('invoices')
        .update({ status: true })
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .lt('due_date', toIsoDate(leaseEligibleStart))
    }

    // earliest unpaid/pending (keep showing if exists)
    const { data: earliestUnpaid } = await adminSupabase
      .from('invoices')
      .select('id, due_date, status')
      .eq('lease_id', lease.id)
      .eq('invoice_type', 'rent')
      .in('status', UNPAID_STATUSES as any[])
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    targetPeriod = earliestUnpaid?.due_date
      ? startOfMonthUtc(new Date(earliestUnpaid.due_date))
      : currentPeriod

    if (leaseEligibleStart && targetPeriod < leaseEligibleStart) {
      targetPeriod = leaseEligibleStart
    }

    let invoice: any = null
    let attempts = 0
    while (attempts < 6) {
      const dueDateIso = toIsoDate(targetPeriod)
      invoice = await selectExistingInvoice(adminSupabase, lease.id, targetPeriod)
      if (!invoice) {
        invoice = await selectByDueDate(adminSupabase, lease.id, dueDateIso)
      }
      // If invoice exists but is before lease eligibility, mark it covered and advance
      if (invoice?.due_date && leaseEligibleStart) {
        const invMonth = startOfMonthUtc(new Date(invoice.due_date))
        if (invMonth < leaseEligibleStart) {
          await adminSupabase.from('invoices').update({ status: true }).eq('id', invoice.id)
          invoice = null
          targetPeriod = leaseEligibleStart
          attempts += 1
          continue
        }
      }
      if (invoice?.status === true) {
        targetPeriod = addMonthsUtc(targetPeriod, 1)
        attempts += 1
        continue
      }
      break
    }

    const dueDateIso = toIsoDate(targetPeriod)

    if (!invoice) {
        const dueLabel = targetPeriod.toLocaleString('en-US', { month: 'long', year: 'numeric' })
        const description = `Rent for ${dueLabel}`
        const { data: created, error: createError } = await adminSupabase
          .from('invoices')
          .upsert(
            {
              lease_id: lease.id,
              invoice_type: 'rent',
              amount: monthlyRent,
              due_date: dueDateIso,
              months_covered: 1,
              status: false,
              description,
            },
            { returning: 'representation', onConflict: 'lease_id,invoice_type,due_date' }
          )
          .single()

      if (createError) {
        console.error('[RentInvoice] Insert error', createError.code, createError.message)
        if (createError.code === '23505') {
          invoice = await selectByDueDate(adminSupabase, lease.id, dueDateIso)
        }
      }

      if (!invoice && created) {
        invoice = created
      }

      if (!invoice) {
        invoice = await selectExistingInvoice(adminSupabase, lease.id, targetPeriod)
      }

      if (!invoice) {
        console.error('[RentInvoice] Failed to create or find invoice', createError?.message || 'unknown', {
          leaseId: lease.id,
          dueDate: dueDateIso,
        })
        return NextResponse.json(
          { success: false, error: 'Unable to prepare rent invoice.' },
          { status: 500 }
        )
      }
    }

    const property = lease.unit?.building
    const coveredThrough =
      coveragePointers.length > 0
        ? coveragePointers.reduce((latest, d) => (d > latest ? d : latest), coveragePointers[0])
        : null
    const payloadInvoice = {
      id: invoice.id,
      amount: Number(invoice.amount),
      status: Boolean(invoice.status),
      invoice_type: invoice.invoice_type,
      description: invoice.description,
      due_date: invoice.due_date,
      months_covered: invoice.months_covered,
      property_name: property?.name || null,
      property_location: property?.location || null,
      unit_label: lease.unit?.unit_number || null,
    }

    return NextResponse.json({
      success: true,
      data: {
        invoice: payloadInvoice,
        lease: {
          monthly_rent: monthlyRent,
          rent_paid_until: lease.rent_paid_until,
          next_rent_due_date: lease.next_rent_due_date,
        },
        coverage_note: coveredThrough
          ? `Rent covered through ${coveredThrough.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
          : null,
      },
    })
  } catch (error) {
    console.error('[RentInvoice] Failed to prepare rent invoice', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare rent invoice.',
      },
      { status: 500 }
    )
  }
}
