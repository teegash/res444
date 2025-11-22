import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const formatDateKey = (input: string) => {
  const [yearStr, monthStr] = input.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null
  }
  return { year, month }
}

export async function GET(
  request: Request,
  { params }: { params: { monthKey: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const monthKey = params.monthKey || request.url.split('/').pop()
    const parsedKey = monthKey ? formatDateKey(monthKey) : null
    if (!parsedKey) {
      return NextResponse.json({ success: false, error: 'Invalid month key.' }, { status: 400 })
    }

    const { year, month } = parsedKey
    const periodStart = new Date(Date.UTC(year, month, 1))
    const periodEnd = new Date(Date.UTC(year, month + 1, 1))

    const periodStartIso = periodStart.toISOString()
    const periodEndIso = periodEnd.toISOString()

    const admin = createAdminClient()

    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select(
        `
        id,
        invoice_type,
        amount,
        due_date,
        created_at,
        status,
        description,
        leases!inner (
          tenant_user_id,
          apartment_units (
            unit_number,
            apartment_buildings (
              name,
              location
            )
          )
        )
      `
      )
      .gte('due_date', periodStartIso)
      .lt('due_date', periodEndIso)
      .eq('leases.tenant_user_id', user.id)

    if (invoiceError) {
      throw invoiceError
    }

    const { data: payments, error: paymentsError } = await admin
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
        mpesa_query_status,
        mpesa_response_code
      `
      )
      .eq('tenant_user_id', user.id)
      .eq('verified', true)
      .gte('created_at', periodStartIso)
      .lt('created_at', periodEndIso)

    if (paymentsError) {
      throw paymentsError
    }

    const transactions: Array<{
      id: string
      type: 'charge' | 'payment'
      description: string
      reference: string | null
      amount: number
      category: string | null
      posted_at: string | null
      balance_after?: number
    }> = []

    const charges = (invoices || []).map((invoice) => ({
      id: invoice.id,
      type: 'charge' as const,
      description:
        invoice.description ||
        (invoice.invoice_type === 'water' ? 'Water Bill' : 'Rent Charge'),
      reference: invoice.id.slice(0, 8).toUpperCase(),
      amount: Number(invoice.amount || 0),
      category: invoice.invoice_type || 'rent',
      posted_at: invoice.created_at || invoice.due_date,
    }))

    transactions.push(...charges)

    ;(payments || []).forEach((payment) => {
      const status = payment.verified
        ? 'verified'
        : payment.mpesa_response_code && payment.mpesa_response_code !== '0'
          ? 'failed'
          : payment.mpesa_query_status || 'pending'

      transactions.push({
        id: payment.id,
        type: 'payment',
        description:
          status === 'failed'
            ? `Failed Payment (${payment.payment_method || 'manual'})`
            : `Payment (${payment.payment_method || 'manual'})`,
        reference:
          payment.mpesa_receipt_number ||
          payment.bank_reference_number ||
          payment.invoice_id?.slice(0, 8) ||
          payment.id.slice(0, 8),
        amount: -Number(payment.amount_paid || 0),
        category: 'payment',
        posted_at: payment.payment_date || payment.created_at,
      })
    })

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
    const enrichedTransactions = transactions.map((txn) => {
      runningBalance += txn.amount
      return {
        ...txn,
        balance_after: runningBalance,
      }
    })

    const property = invoices?.[0]?.leases?.apartment_units
    const summary = {
      openingBalance: 0,
      totalCharges: charges.reduce((sum, charge) => sum + charge.amount, 0),
      totalPayments: Math.abs(
        transactions
          .filter((txn) => txn.type === 'payment')
          .reduce((sum, txn) => sum + txn.amount, 0)
      ),
      closingBalance: runningBalance,
    }

    return NextResponse.json({
      success: true,
      data: {
        periodLabel: periodStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        property: property
          ? {
              property_name: property.apartment_buildings?.name || null,
              property_location: property.apartment_buildings?.location || null,
              unit_number: property.unit_number || null,
            }
          : null,
        transactions: enrichedTransactions,
        summary,
      },
    })
  } catch (error) {
    console.error('[TenantMonthlyStatement] Failed to fetch monthly statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load statement.' },
      { status: 500 }
    )
  }
}
