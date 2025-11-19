import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data: leases, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `id, status, tenant_user_id, rent_paid_until, unit:apartment_units (
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
      .in('status', ['active', 'pending'])

    if (leaseError) {
      throw leaseError
    }

    if (!leases || leases.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const leaseIds = leases.map((lease) => lease.id)
    const leaseMap = new Map(
      leases.map((lease) => [lease.id, lease])
    )

    const { data: invoices, error: invoiceError } = await adminSupabase
      .from('invoices')
      .select('id, lease_id, amount, due_date, status, invoice_type, description, created_at')
      .in('lease_id', leaseIds)
      .order('due_date', { ascending: true })

    if (invoiceError) {
      throw invoiceError
    }

    const statusFilter = request.nextUrl.searchParams.get('status')
    const payload = (invoices || []).map((invoice) => {
      const lease = leaseMap.get(invoice.lease_id as string)
      // @ts-ignore
      const unit = lease?.unit
      const building = unit?.building
      return {
        id: invoice.id,
        lease_id: invoice.lease_id,
        amount: Number(invoice.amount),
        due_date: invoice.due_date,
        status: Boolean(invoice.status),
        invoice_type: invoice.invoice_type,
        description: invoice.description,
        created_at: invoice.created_at,
        // @ts-ignore
        rent_paid_until: lease?.rent_paid_until || null,
        unit_label: unit?.unit_number || null,
        property_name: building?.name || null,
        property_location: building?.location || null,
      }
    })

    const filteredPayload =
      statusFilter === 'pending'
        ? payload.filter((invoice) => !invoice.status)
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
