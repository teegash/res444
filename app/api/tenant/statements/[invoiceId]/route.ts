import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type StatementTransaction = {
  id: string
  type: 'charge' | 'payment'
  description: string
  reference: string | null
  amount: number
  posted_at: string | null
  status?: string
  method?: string | null
}

function resolveInvoiceId(request: NextRequest, params?: { invoiceId?: string }) {
  if (params?.invoiceId) {
    return params.invoiceId
  }
  const urlParam = request.nextUrl.searchParams.get('invoiceId')
  if (urlParam) return urlParam
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  return segments[segments.length - 1]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const invoiceId = resolveInvoiceId(request, params)
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required.' }, { status: 400 })
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
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select(
        `
        id,
        lease_id,
        invoice_type,
        amount,
        due_date,
        status,
        description,
        leases (
          id,
          tenant_user_id,
          monthly_rent,
          rent_paid_until,
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
      `
      )
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      throw invoiceError
    }

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 })
    }

    const lease = invoice.leases as {
      id: string
      tenant_user_id: string
      monthly_rent: number | null
      rent_paid_until: string | null
      start_date: string | null
      end_date: string | null
      unit: {
        unit_number: string | null
        apartment_buildings: { name: string | null; location: string | null } | null
      } | null
    } | null

    if (!lease || lease.tenant_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: tenantProfile } = await admin
      .from('user_profiles')
      .select('full_name, phone_number, profile_picture_url')
      .eq('id', user.id)
      .maybeSingle()

    const { data: payments, error: paymentError } = await admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_method,
        payment_date,
        created_at,
        verified,
        mpesa_receipt_number,
        bank_reference_number,
        mpesa_query_status,
        mpesa_response_code
      `
      )
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: true })

    if (paymentError) {
      throw paymentError
    }

    const transactions: StatementTransaction[] = []

    transactions.push({
      id: invoice.id,
      type: 'charge',
      description:
        invoice.description ||
        (invoice.invoice_type === 'water' ? 'Water Bill' : 'Monthly Rent'),
      reference: invoice.id.slice(0, 8).toUpperCase(),
      amount: Number(invoice.amount || 0),
      posted_at: invoice.due_date,
      status: invoice.status || 'unpaid',
    })

    for (const payment of payments || []) {
      const method = payment.payment_method || 'manual'
      const status = payment.verified
        ? 'verified'
        : payment.mpesa_response_code && payment.mpesa_response_code !== '0'
          ? 'failed'
          : payment.mpesa_query_status
            ? payment.mpesa_query_status
            : 'pending'

      transactions.push({
        id: payment.id,
        type: 'payment',
        description:
          invoice.invoice_type === 'water'
            ? `Water Payment (${method})`
            : `Rent Payment (${method})`,
        reference:
          payment.mpesa_receipt_number ||
          payment.bank_reference_number ||
          payment.id.slice(0, 8).toUpperCase(),
        amount: -Number(payment.amount_paid || 0),
        posted_at: payment.payment_date || payment.created_at,
        status,
        method,
      })
    }

    transactions.sort((a, b) => {
      const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0
      const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0
      if (aTime === bTime) {
        if (a.type === b.type) return 0
        return a.type === 'charge' ? -1 : 1
      }
      return aTime - bTime
    })

    let runningBalance = 0
    const enrichedTransactions = transactions.map((transaction) => {
      runningBalance += transaction.amount
      return {
        ...transaction,
        balance_after: runningBalance,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          invoice_type: invoice.invoice_type,
          amount: Number(invoice.amount || 0),
          due_date: invoice.due_date,
          status: invoice.status,
          description: invoice.description,
        },
        tenant: {
          name: tenantProfile?.full_name || 'Tenant',
          phone_number: tenantProfile?.phone_number || null,
          profile_picture_url: tenantProfile?.profile_picture_url || null,
        },
        lease: lease
          ? {
              id: lease.id,
              property_name: lease.unit?.apartment_buildings?.name || null,
              property_location: lease.unit?.apartment_buildings?.location || null,
              unit_number: lease.unit?.unit_number || null,
              monthly_rent: lease.monthly_rent ? Number(lease.monthly_rent) : null,
              rent_paid_until: lease.rent_paid_until,
              start_date: lease.start_date,
              end_date: lease.end_date,
            }
          : null,
        transactions: enrichedTransactions,
        summary: {
          openingBalance: enrichedTransactions.length ? enrichedTransactions[0].amount : 0,
          closingBalance: runningBalance,
          totalPayments: Math.abs(
            enrichedTransactions
              .filter((txn) => txn.type === 'payment')
              .reduce((sum, txn) => sum + txn.amount, 0)
          ),
        },
      },
    })
  } catch (error) {
    console.error('[TenantStatement] Failed to fetch statement', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load statement.',
      },
      { status: 500 }
    )
  }
}
