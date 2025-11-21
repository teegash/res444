import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function resolvePaymentId(request: NextRequest, params?: { paymentId?: string }) {
  if (params?.paymentId) {
    return params.paymentId
  }
  const urlParam = request.nextUrl.searchParams.get('paymentId')
  if (urlParam) return urlParam
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  return segments[segments.length - 1]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const paymentId = resolvePaymentId(request, params)
    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        tenant_user_id,
        invoice_id,
        amount_paid,
        payment_method,
        payment_date,
        created_at,
        verified,
        months_paid,
        mpesa_receipt_number,
        bank_reference_number,
        notes,
        invoices (
          id,
          invoice_type,
          amount,
          due_date,
          description,
          lease:leases (
            id,
            start_date,
            end_date,
            unit:apartment_units (
              unit_number,
              apartment_buildings (
                name,
                location
              )
            )
          )
        )
      `
      )
      .eq('id', paymentId)
      .maybeSingle()

    if (paymentError) {
      throw paymentError
    }

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 })
    }

    if (payment.tenant_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const invoice = payment.invoices as {
      id: string
      invoice_type: string | null
      amount: number | null
      due_date: string | null
      description: string | null
      lease: {
        id: string
        start_date: string | null
        end_date: string | null
        unit: {
          unit_number: string | null
          apartment_buildings: {
            name: string | null
            location: string | null
          } | null
        } | null
      } | null
    } | null

    const { data: tenantProfile } = await admin
      .from('user_profiles')
      .select('full_name, phone_number, address')
      .eq('id', user.id)
      .maybeSingle()

    const coverageMonths = Number(payment.months_paid || 1)
    const coverageStart = invoice?.due_date ? new Date(invoice.due_date) : null
    let coverageLabel = 'Current billing period'

    if (coverageStart && !Number.isNaN(coverageStart.getTime())) {
      if (coverageMonths <= 1) {
        coverageLabel = coverageStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      } else {
        const end = new Date(coverageStart)
        end.setMonth(end.getMonth() + coverageMonths - 1)
        const startLabel = coverageStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        const endLabel = end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        coverageLabel = `${startLabel} – ${endLabel}`
      }
    } else if (coverageMonths > 1) {
      coverageLabel = `${coverageMonths} months`
    }

    return NextResponse.json({
      success: true,
      data: {
        payment: {
          id: payment.id,
          amount: Number(payment.amount_paid),
          method: payment.payment_method,
          status: payment.verified ? 'verified' : 'pending',
          created_at: payment.created_at,
          payment_date: payment.payment_date || payment.created_at,
          mpesa_receipt_number: payment.mpesa_receipt_number,
          bank_reference_number: payment.bank_reference_number,
          notes: payment.notes,
          months_paid: coverageMonths,
          coverage_label: coverageLabel,
        },
        invoice: invoice
          ? {
              id: invoice.id,
              type: invoice.invoice_type,
              amount: Number(invoice.amount || 0),
              due_date: invoice.due_date,
              description: invoice.description,
            }
          : null,
        property: invoice?.lease?.unit
          ? {
              property_name: invoice.lease.unit.apartment_buildings?.name || null,
              property_location: invoice.lease.unit.apartment_buildings?.location || null,
              unit_number: invoice.lease.unit.unit_number || null,
            }
          : null,
        tenant: {
          name: tenantProfile?.full_name || 'Tenant',
          phone_number: tenantProfile?.phone_number || null,
          address: tenantProfile?.address || null,
        },
      },
    })
  } catch (error) {
    console.error('[TenantReceipt] Failed to load receipt', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load receipt.',
      },
      { status: 500 }
    )
  }
}
