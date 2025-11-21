import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: {
    invoiceId: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const invoiceId = params?.invoiceId || request.nextUrl.searchParams.get('invoiceId')
  if (!invoiceId) {
    return NextResponse.json({ success: false, error: 'Invoice id is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminSupabase = createAdminClient()
    const { data: invoice, error } = await adminSupabase
      .from('invoices')
      .select(
        `
        id,
        amount,
        due_date,
        status,
        description,
        invoice_type,
        created_at,
        lease:leases (
          id,
          tenant_user_id,
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
        )
      `
      )
      .eq('id', invoiceId)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 })
    }

    if (invoice.lease?.tenant_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
    }

    const property = invoice.lease?.unit?.building
      const payload = {
        id: invoice.id,
        amount: invoice.amount,
        status: invoice.status,
      is_paid: Boolean(invoice.status),
      description: invoice.description,
      invoice_type: invoice.invoice_type,
      due_date: invoice.due_date,
      created_at: invoice.created_at,
      unit: {
        id: invoice.lease?.unit?.id || null,
        label: invoice.lease?.unit?.unit_number || null,
      },
        property: property
          ? {
              id: property.id,
              name: property.name,
              location: property.location,
            }
          : null,
        rent_paid_until: invoice.lease?.rent_paid_until || null,
      }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[TenantInvoice.GET] Failed to load invoice', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load invoice.',
      },
      { status: 500 }
    )
  }
}
