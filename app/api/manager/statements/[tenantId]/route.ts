import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type ManagerContext =
  | {
      adminSupabase: ReturnType<typeof createAdminClient>
    }
  | { error: NextResponse }

async function getManagerContext(): Promise<ManagerContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminSupabase = createAdminClient()
  const { data: profile, error: profileError } = await adminSupabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile || !MANAGER_ROLES.includes((profile.role || '') as typeof MANAGER_ROLES[number])) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { adminSupabase }
}

type StatementTransaction = {
  id: string
  kind: 'charge' | 'payment'
  payment_type: string
  payment_method: string | null
  status: string
  posted_at: string | null
  description: string
  reference: string | null
  amount: number
  balance_after?: number
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { tenantId } = params

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant ID is required.' }, { status: 400 })
    }

    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }

    const { adminSupabase } = ctx

    const { data: tenantProfile, error: tenantError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantError) {
      throw tenantError
    }

    if (!tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant not found.' }, { status: 404 })
    }

    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        status,
        start_date,
        end_date,
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
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    const leaseId = lease?.id

    let invoices: Array<{
      id: string
      invoice_type: string
      amount: number
      due_date: string | null
      status: string | null
      description: string | null
    }> = []

    if (leaseId) {
      const { data: invoiceRows, error: invoiceError } = await adminSupabase
        .from('invoices')
        .select('id, invoice_type, amount, due_date, status, description')
        .eq('lease_id', leaseId)
        .order('due_date', { ascending: true })
        .limit(48)

      if (invoiceError) {
        throw invoiceError
      }

      invoices = (invoiceRows || []).map((invoice) => ({
        id: invoice.id,
        invoice_type: invoice.invoice_type,
        amount: Number(invoice.amount),
        due_date: invoice.due_date,
        status: invoice.status,
        description: invoice.description,
      }))
    }

    const { data: paymentRows, error: paymentsError } = await adminSupabase
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        amount_paid,
        payment_method,
        payment_date,
        created_at,
        verified,
        mpesa_receipt_number,
        bank_reference_number,
        notes,
        mpesa_query_status,
        mpesa_response_code,
        invoices (
          invoice_type,
          due_date,
          status
        )
      `
      )
      .eq('tenant_user_id', tenantId)
      .order('payment_date', { ascending: true })
      .limit(120)

    if (paymentsError) {
      throw paymentsError
    }

    const chargeTransactions: StatementTransaction[] = invoices.map((invoice) => {
      const postedAt = invoice.due_date
      const typeLabel = invoice.invoice_type || 'rent'
      const description =
        typeLabel === 'water'
          ? `Water Bill${postedAt ? ` - ${new Date(postedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : ''}`
          : `Rent Invoice${postedAt ? ` - ${new Date(postedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : ''}`

      return {
        id: invoice.id,
        kind: 'charge',
        payment_type: typeLabel,
        payment_method: null,
        status: invoice.status || 'unpaid',
        posted_at: postedAt,
        description,
        reference: invoice.id.slice(0, 8).toUpperCase(),
        amount: Number(invoice.amount || 0),
      }
    })

    const paymentTransactions: StatementTransaction[] = (paymentRows || []).map((payment) => {
      const invoice = payment.invoices as { invoice_type: string | null; due_date: string | null; status: string | null } | null
      const paymentType = invoice?.invoice_type || 'rent'
      const postedAt = payment.payment_date || payment.created_at
      const method = payment.payment_method
      const reference =
        method === 'mpesa'
          ? payment.mpesa_receipt_number
          : method === 'bank_transfer'
            ? payment.bank_reference_number
            : payment.invoice_id?.slice(0, 8) || payment.id.slice(0, 8)

      const status = payment.verified
        ? 'verified'
        : payment.mpesa_response_code && payment.mpesa_response_code !== '0'
          ? 'failed'
          : 'pending'

      const methodLabel = (method || 'payment').replace('_', ' ')
      const description = `${paymentType === 'water' ? 'Water' : 'Rent'} Payment (${methodLabel})`

      return {
        id: payment.id,
        kind: 'payment',
        payment_type: paymentType,
        payment_method: method,
        status,
        posted_at: postedAt,
        description,
        reference,
        amount: -Number(payment.amount_paid || 0),
      }
    })

    const combinedTransactions = [...chargeTransactions, ...paymentTransactions].sort((a, b) => {
      const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0
      const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0
      if (aTime === bTime) {
        if (a.kind === b.kind) return 0
        return a.kind === 'charge' ? -1 : 1
      }
      return aTime - bTime
    })

    let runningBalance = 0
    let totalCharges = 0
    let totalPayments = 0

    const transactions = combinedTransactions.map((transaction) => {
      if (transaction.amount >= 0) {
        totalCharges += transaction.amount
      } else {
        totalPayments += transaction.amount
      }

      runningBalance += transaction.amount
      return {
        ...transaction,
        balance_after: runningBalance,
      }
    })

    const periodStart = transactions.length > 0 ? transactions[0].posted_at : null
    const periodEnd = transactions.length > 0 ? transactions[transactions.length - 1].posted_at : null

    const payload = {
      tenant: {
        id: tenantProfile.id,
        name: tenantProfile.full_name || 'Tenant',
        phone_number: tenantProfile.phone_number || null,
        email: null,
        profile_picture_url: tenantProfile.profile_picture_url || null,
      },
      lease: lease
        ? {
            id: lease.id,
            status: lease.status,
            start_date: lease.start_date,
            end_date: lease.end_date,
            monthly_rent: lease.monthly_rent ? Number(lease.monthly_rent) : null,
            rent_paid_until: lease.rent_paid_until,
            property_name: lease.unit?.building?.name || null,
            property_location: lease.unit?.building?.location || null,
            unit_number: lease.unit?.unit_number || null,
          }
        : null,
      period: {
        start: periodStart,
        end: periodEnd,
      },
      summary: {
        openingBalance: 0,
        closingBalance: runningBalance,
        totalCharges,
        totalPayments: Math.abs(totalPayments),
      },
      transactions,
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[ManagerStatement] Failed to load statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant statement.' },
      { status: 500 }
    )
  }
}
