import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonthUtc, addMonthsUtc, rentDueDateForPeriod, toIsoDate } from '@/lib/invoices/rentPeriods'

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

    let targetPeriod = currentPeriod
    if (lease.rent_paid_until) {
      const paidUntil = new Date(lease.rent_paid_until)
      if (!Number.isNaN(paidUntil.getTime())) {
        const paidStart = startOfMonthUtc(paidUntil)
        const nextPeriod = addMonthsUtc(paidStart, 1)
        targetPeriod = nextPeriod
      }
    }

    let invoice = await selectExistingInvoice(adminSupabase, lease.id, targetPeriod)

    if (!invoice) {
        const dueLabel = targetPeriod.toLocaleString('en-US', { month: 'long', year: 'numeric' })
        const dueDate = rentDueDateForPeriod(targetPeriod)
        const description = `Rent for ${dueLabel}`
        const { data: created, error: createError } = await adminSupabase
          .from('invoices')
          .insert(
            {
              lease_id: lease.id,
              invoice_type: 'rent',
              amount: monthlyRent,
              due_date: dueDate,
              months_covered: 1,
              status: false,
              description,
            },
            { returning: 'representation' }
          )
          .single()

      if (createError) {
        console.error('[RentInvoice] Insert error', createError.code, createError.message)
        if (createError.code === '23505') {
          invoice = await selectExistingInvoice(adminSupabase, lease.id, dueDateKey)
        }
      }

      if (!invoice && created) {
        invoice = created
      }

      if (!invoice) {
        console.error(
          '[RentInvoice] Failed to create or find invoice',
          createError?.message || 'unknown',
          { leaseId: lease.id, dueDate: dueDateKey }
        )
        return NextResponse.json(
          { success: false, error: 'Unable to prepare rent invoice.' },
          { status: 500 }
        )
      }
    }

    const property = lease.unit?.building
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
        },
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
