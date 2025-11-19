import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoVerifyMpesaPayments } from '@/lib/mpesa/autoVerify'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type ManagerContext = {
  adminSupabase: ReturnType<typeof createAdminClient>
  user: { id: string }
}

type ManagerContextResult = ManagerContext | { error: NextResponse }

async function getManagerContext(): Promise<ManagerContextResult> {
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

  if (profileError || !profile || !MANAGER_ROLES.includes(profile.role || '')) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { adminSupabase, user }
}

function mapPayment(row: any) {
  const amount = Number(row.amount_paid) || 0
  const invoice = row.invoice || null
  const lease = invoice?.lease || null
  const unit = lease?.unit || null
  const building = unit?.building || null

  return {
    id: row.id,
    invoiceId: invoice?.id || null,
    tenantId: row.tenant?.id || null,
    tenantName: row.tenant?.full_name || 'Tenant',
    tenantPhone: row.tenant?.phone_number || null,
    propertyName: building?.name || null,
    propertyLocation: building?.location || null,
    unitLabel: unit?.unit_number || null,
    amount,
    paymentMethod: row.payment_method || null,
    invoiceType: invoice?.invoice_type || null,
    invoiceAmount: invoice?.amount || null,
    invoiceDueDate: invoice?.due_date || null,
    paymentDate: row.payment_date,
    mpesaReceiptNumber: row.mpesa_receipt_number || null,
    bankReferenceNumber: row.bank_reference_number || null,
    depositSlipUrl: row.deposit_slip_url || null,
    verified: Boolean(row.verified),
    verifiedBy: row.verified_by_profile?.full_name || null,
    verifiedAt: row.verified_at,
    mpesaAutoVerified: row.mpesa_auto_verified || false,
    mpesaQueryStatus: row.mpesa_query_status || null,
    mpesaResponseCode: row.mpesa_response_code || null,
    lastStatusCheck: row.last_status_check || row.mpesa_verification_timestamp || null,
    retryCount: row.retry_count || 0,
    notes: row.notes || null,
  }
}

function isFailure(payment: ReturnType<typeof mapPayment>) {
  if (payment.verified) return false
  if (payment.paymentMethod !== 'mpesa') return false
  const status = (payment.mpesaQueryStatus || '').toLowerCase()
  const responseCode = payment.mpesaResponseCode || ''
  if (!status && !responseCode) return false
  if (['failed', 'error', 'timeout', 'cancelled', 'insufficientfunds'].includes(status)) {
    return true
  }
  if (responseCode && responseCode !== '0') {
    return true
  }
  return false
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value : 0
}

function buildBreakdown(payments: ReturnType<typeof mapPayment>[]) {
  const map = new Map<string, { count: number; amount: number }>()
  payments.forEach((payment) => {
    const reasonRaw = payment.mpesaQueryStatus || payment.mpesaResponseCode || payment.notes || 'unspecified'
    const reason = reasonRaw.replace(/_/g, ' ').trim() || 'unspecified'
    const current = map.get(reason) || { count: 0, amount: 0 }
    current.count += 1
    current.amount += payment.amount
    map.set(reason, current)
  })
  return Array.from(map.entries()).map(([reason, stats]) => ({ reason, count: stats.count, amount: stats.amount }))
}

export async function GET() {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }
    const { adminSupabase } = ctx

    const { data, error } = await adminSupabase
      .from('payments')
      .select(
        `
        id,
        invoice_id,
        tenant_user_id,
        amount_paid,
        payment_method,
        mpesa_receipt_number,
        bank_reference_number,
        deposit_slip_url,
        payment_date,
        verified,
        verified_at,
        verified_by,
        notes,
        mpesa_auto_verified,
        mpesa_verification_timestamp,
        mpesa_query_status,
        mpesa_response_code,
        last_status_check,
        retry_count,
        tenant:user_profiles!payments_tenant_user_id_fkey (
          id,
          full_name,
          phone_number
        ),
        verified_by_profile:user_profiles!payments_verified_by_fkey (
          id,
          full_name
        ),
        invoice:invoices (
          id,
          invoice_type,
          amount,
          due_date,
          lease:leases (
            id,
            unit:apartment_units (
              unit_number,
              building:apartment_buildings (
                name,
                location
              )
            )
          )
        )
      `
      )
      .order('payment_date', { ascending: false })
      .limit(300)

    if (error) {
      throw error
    }

    const mapped = (data || []).map(mapPayment)
    const failed = mapped.filter(isFailure)
    const failedIds = new Set(failed.map((payment) => payment.id))
    const pending = mapped.filter((payment) => !payment.verified && !failedIds.has(payment.id))
    const verified = mapped.filter((payment) => payment.verified)

    const pendingDeposits = pending.filter((payment) => payment.paymentMethod === 'bank_transfer')
    const confirmedDeposits = verified.filter((payment) => payment.paymentMethod === 'bank_transfer')
    const rejectedDeposits = pending.filter(
      (payment) => payment.paymentMethod === 'bank_transfer' && (payment.notes || '').toLowerCase().includes('reject')
    )

    const stats = {
      pendingAmount: pending.reduce((sum, payment) => sum + payment.amount, 0),
      pendingCount: pending.length,
      depositsPendingAmount: pendingDeposits.reduce((sum, payment) => sum + payment.amount, 0),
      depositsPendingCount: pendingDeposits.length,
      depositsRejectedCount: rejectedDeposits.length,
      verifiedAmount: verified.reduce((sum, payment) => sum + payment.amount, 0),
      verifiedCount: verified.length,
      autoVerifiedAmount: verified
        .filter((payment) => payment.paymentMethod === 'mpesa' && payment.mpesaAutoVerified)
        .reduce((sum, payment) => sum + payment.amount, 0),
      autoVerifiedCount: verified.filter((payment) => payment.paymentMethod === 'mpesa' && payment.mpesaAutoVerified).length,
      managerVerifiedAmount: verified
        .filter((payment) => !payment.mpesaAutoVerified)
        .reduce((sum, payment) => sum + payment.amount, 0),
      managerVerifiedCount: verified.filter((payment) => !payment.mpesaAutoVerified).length,
      failedAmount: failed.reduce((sum, payment) => sum + payment.amount, 0),
      failedCount: failed.length,
    }

    const lastAutoCheckSource = mapped
      .map((payment) => payment.lastStatusCheck)
      .filter(Boolean)
      .sort((a, b) => (a! > b! ? -1 : 1))
    const lastAutoCheck = lastAutoCheckSource[0] || null

    const integration = {
      darajaEnvironment: process.env.MPESA_ENVIRONMENT || 'sandbox',
      shortcodeMasked: process.env.MPESA_SHORTCODE
        ? process.env.MPESA_SHORTCODE.replace(/.(?=.{4})/g, '•')
        : null,
      autoVerifyEnabled: process.env.MPESA_AUTO_VERIFY_ENABLED !== 'false',
      autoVerifyFrequencySeconds: Number(process.env.MPESA_AUTO_VERIFY_INTERVAL || '30'),
      lastAutoCheck,
      autoVerifiedToday: verified.filter((payment) => {
        if (!payment.mpesaAutoVerified || !payment.verifiedAt) {
          return false
        }
        const verifiedAt = new Date(payment.verifiedAt)
        const now = new Date()
        return (
          verifiedAt.getFullYear() === now.getFullYear() &&
          verifiedAt.getMonth() === now.getMonth() &&
          verifiedAt.getDate() === now.getDate()
        )
      }).length,
      pendingAmount: stats.pendingAmount,
    }

    return NextResponse.json({
      success: true,
      data: {
        pending,
        deposits: {
          pending: pendingDeposits,
          confirmed: confirmedDeposits,
          rejectedCount: stats.depositsRejectedCount,
        },
        verified,
        failed,
        stats,
        breakdown: buildBreakdown(failed),
        integration,
      },
    })
  } catch (responseOrError) {
    if (responseOrError instanceof Response) {
      throw responseOrError
    }

    const error = responseOrError as Error
    console.error('[ManagerPayments] Failed to fetch payments', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch payments.',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }
    const result = await autoVerifyMpesaPayments()

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Auto-verification completed. ${result.verified_count} verified, ${result.failed_count} failed.`
        : 'Auto-verification failed.',
      data: result,
    })
  } catch (responseOrError) {
    if (responseOrError instanceof Response) {
      throw responseOrError
    }

    const error = responseOrError as Error
    console.error('[ManagerPayments] Manual sync failed', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Manual sync failed.',
      },
      { status: 500 }
    )
  }
}
