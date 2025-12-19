import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
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

    const { data, error } = await admin
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        amount_paid,
        payment_method,
        verified,
        payment_date,
        created_at,
        mpesa_receipt_number,
        bank_reference_number,
        deposit_slip_url,
        months_paid,
        mpesa_query_status,
        mpesa_response_code,
        invoices (
          invoice_type,
          due_date,
          leases (
            apartment_units (
              unit_number,
              apartment_buildings (
                name
              )
            )
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      throw error
    }

    const mapped = (data || []).map((payment) => {
      const invoice = payment.invoices as {
        invoice_type: string | null
        due_date: string | null
        leases: {
          apartment_units: {
            unit_number: string | null
            apartment_buildings: { name: string | null } | null
          } | null
        } | null
      } | null

      const transactionStatus = payment.verified
        ? 'verified'
        : payment.mpesa_response_code && payment.mpesa_response_code !== '0'
          ? 'failed'
          : payment.mpesa_query_status &&
              /fail|cancel|timeout|insufficient/i.test(payment.mpesa_query_status)
            ? 'failed'
            : 'pending'

      return {
        id: payment.id,
        invoice_id: payment.invoice_id,
        amount_paid: Number(payment.amount_paid),
        payment_method: payment.payment_method,
        verified: Boolean(payment.verified),
        created_at: payment.created_at,
        posted_at: payment.payment_date || payment.created_at,
        status: transactionStatus,
        mpesa_receipt_number: payment.mpesa_receipt_number,
        bank_reference_number: payment.bank_reference_number,
        months_paid: payment.months_paid || 1,
        invoice_type: invoice?.invoice_type || null,
        payment_type: invoice?.invoice_type || null,
        due_date: invoice?.due_date || null,
        property_name: invoice?.leases?.apartment_units?.apartment_buildings?.name || null,
        unit_label: invoice?.leases?.apartment_units?.unit_number || null,
      }
    })

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error('[TenantPayments] Failed to fetch payments', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch payments.',
      },
      { status: 500 }
    )
  }
}
