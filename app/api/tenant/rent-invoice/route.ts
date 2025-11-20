import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function selectExistingInvoice(adminSupabase: ReturnType<typeof createAdminClient>, leaseId: string, dueDate: string) {
  const { data } = await adminSupabase
    .from('invoices')
    .select('id, amount, due_date, status, invoice_type, description, months_covered, lease_id')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .eq('due_date', dueDate)
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
    let dueDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))

    if (lease.rent_paid_until) {
      const paidUntil = new Date(lease.rent_paid_until)
      if (!Number.isNaN(paidUntil.getTime())) {
        const nextPeriod = new Date(paidUntil)
        nextPeriod.setUTCMonth(nextPeriod.getUTCMonth() + 1)
        nextPeriod.setUTCDate(1)
        if (nextPeriod > dueDate) {
          dueDate = nextPeriod
        }
      }
    }

    const dueDateKey = toDateKey(dueDate)

    let invoice = await selectExistingInvoice(adminSupabase, lease.id, dueDateKey)

    if (!invoice) {
      const dueLabel = dueDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const description = `Rent for ${dueLabel}`
      const { data: created, error: createError } = await adminSupabase
        .from('invoices')
        .insert(
          {
            lease_id: lease.id,
            invoice_type: 'rent',
            amount: monthlyRent,
            due_date: dueDateKey,
            months_covered: 1,
            status: 'unpaid',
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
        console.error('[RentInvoice] Failed to create or find invoice', createError?.message || 'unknown')
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
      status: invoice.status === 'paid',
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
