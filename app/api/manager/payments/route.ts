import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoVerifyMpesaPayments } from '@/lib/mpesa/autoVerify'
import { getMpesaSettings } from '@/lib/mpesa/settings'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const
const AUTO_VERIFY_TIMEOUT_MINUTES = Number(process.env.MPESA_AUTO_VERIFY_TIMEOUT_MINUTES || '120')

type ManagerContext = {
  adminSupabase: ReturnType<typeof createAdminClient>
  user: { id: string }
  role: (typeof MANAGER_ROLES)[number]
  propertyId: string | null
  orgId: string
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
  const { data: membership, error: membershipError } = await adminSupabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let orgId = membership?.organization_id || null

  const { data: profile, error: profileError } = await adminSupabase
    .from('user_profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load profile' }, { status: 500 }) }
  }

  if (profile?.organization_id && !orgId) {
    orgId = profile.organization_id
  }

  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 }) }
  }

  if (!profile || !MANAGER_ROLES.includes(profile.role || '')) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  const propertyId: string | null =
    (user.user_metadata as any)?.property_id || (user.user_metadata as any)?.building_id || null

  return { adminSupabase, user, role: profile.role, propertyId, orgId }
}

async function expireLongPendingMpesaPayments(
  adminSupabase: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  if (AUTO_VERIFY_TIMEOUT_MINUTES <= 0) {
    return
  }

  const cutoff = new Date(Date.now() - AUTO_VERIFY_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { data: stalePayments, error } = await adminSupabase
    .from('payments')
    .select('id, notes, mpesa_query_status, mpesa_response_code, last_status_check')
    .eq('payment_method', 'mpesa')
    .eq('verified', false)
    .eq('organization_id', orgId)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[ManagerPayments] Failed to load stale M-Pesa payments', error)
    return
  }

  if (!stalePayments || stalePayments.length === 0) {
    return
  }

  const nowIso = new Date().toISOString()
  const timeoutMessage = `Auto verification timed out after 2 hours`

  await Promise.all(
    stalePayments.map(async (payment) => {
      const status = (payment.mpesa_query_status || '').toLowerCase()
      const code = payment.mpesa_response_code || ''
      const isStillAutoChecking =
        !code ||
        ['17', '1032', '1037'].includes(code) ||
        status.length === 0 ||
        status.includes('pending') ||
        status.includes('auto')

      if (!isStillAutoChecking) {
        return
      }

      const noteLine = `[System] ${timeoutMessage} on ${new Date().toLocaleString()}`
      const updatedNotes = payment.notes ? `${payment.notes}\n${noteLine}` : noteLine

      const { error: updateError } = await adminSupabase
        .from('payments')
        .update({
          mpesa_query_status: timeoutMessage,
          mpesa_response_code: 'timeout',
          last_status_check: nowIso,
          notes: updatedNotes,
        })
        .eq('id', payment.id)

      if (updateError) {
        console.error('[ManagerPayments] Failed to mark payment as timed out', {
          paymentId: payment.id,
          error: updateError.message,
        })
      }
    })
  )
}

async function getSignedDepositUrl(adminSupabase: ReturnType<typeof createAdminClient>, raw?: string | null) {
  if (!raw) return null

  // Attempt to parse a full storage URL and extract bucket/path for signing
  let parsedBucket: string | null = null
  let parsedPath: string | null = null

  try {
    if (raw.startsWith('http')) {
      const url = new URL(raw)
      const segments = url.pathname.split('/').filter(Boolean)
      // expect: /storage/v1/object/<visibility>/<bucket>/<path...>
      const objectIdx = segments.findIndex((seg) => seg === 'object')
      if (objectIdx >= 0 && segments.length > objectIdx + 2) {
        parsedBucket = segments[objectIdx + 2] || null
        parsedPath = segments.slice(objectIdx + 3).join('/')
      }
    }
  } catch {
    // ignore parse errors; fallback to raw handling
  }

  // If we got bucket/path from URL, try to sign that
  if (parsedBucket && parsedPath) {
    const { data, error } = await adminSupabase.storage.from(parsedBucket).createSignedUrl(parsedPath, 60 * 60 * 12)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }

  // raw may already include bucket prefix; extract
  const parts = raw.split('/')
  const candidateBucket = parsedBucket || parts[0]
  const candidatePath = parsedPath || parts.slice(1).join('/')

  const buckets = ['deposit-slips', 'deposit_slips', candidateBucket].filter(Boolean)
  for (const bucket of buckets) {
    const cleanPath = raw.replace(/^(deposit[-_]slips)\//, '')
    const pathToUse = raw.startsWith(bucket + '/') ? candidatePath : cleanPath || candidatePath || raw
    const { data, error } = await adminSupabase.storage.from(bucket).createSignedUrl(pathToUse, 60 * 60 * 12)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }

  // Fallback public URL shape in case bucket is public
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && (candidateBucket || candidatePath)) {
    const bucketsFallback = ['deposit-slips', 'deposit_slips', candidateBucket].filter(Boolean)
    for (const bucket of bucketsFallback) {
      return `${supabaseUrl}/storage/v1/object/public/${bucket}/${candidatePath || raw.replace(/^(deposit[-_]slips)\//, '')}`
    }
  }

  return raw
}

function mapPayment(
  row: any,
  lookups?: {
    tenantMap?: Map<string, { full_name: string | null; phone_number: string | null }>
    verifiedMap?: Map<string, string | null>
    depositUrlMap?: Map<string, string>
  }
) {
  const amount = Number(row.amount_paid) || 0
  const invoice = row.invoice || null
  const lease = invoice?.lease || null
  const unit = lease?.unit || null
  const building = unit?.building || null

  const tenantProfile = lookups?.tenantMap?.get(row.tenant_user_id || '') || null
  const verifiedByName = row.verified_by ? lookups?.verifiedMap?.get(row.verified_by) || null : null

  return {
    id: row.id,
    invoiceId: invoice?.id || null,
    tenantId: row.tenant_user_id || null,
    tenantName: tenantProfile?.full_name || 'Tenant',
    tenantPhone: tenantProfile?.phone_number || null,
    propertyId: building?.id || null,
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
    depositSlipUrl: lookups?.depositUrlMap?.get(row.id) || row.deposit_slip_url || null,
    verified: Boolean(row.verified),
    verifiedBy: verifiedByName,
    verifiedAt: row.verified_at,
    mpesaAutoVerified: row.mpesa_auto_verified || false,
    mpesaQueryStatus: row.mpesa_query_status || null,
    mpesaResponseCode: row.mpesa_response_code || null,
    lastStatusCheck: row.last_status_check || row.mpesa_verification_timestamp || null,
    retryCount: row.retry_count || 0,
    notes: row.notes || null,
    monthsPaid: row.months_paid || 1,
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
    const { adminSupabase, role, propertyId, orgId } = ctx
    const settings = await getMpesaSettings()

    await expireLongPendingMpesaPayments(adminSupabase, orgId)

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
        months_paid,
        invoice:invoices (
          id,
          invoice_type,
          amount,
          due_date,
          months_covered,
          lease:leases (
            id,
            rent_paid_until,
            unit:apartment_units (
              unit_number,
              building:apartment_buildings (
                id,
                name,
                location
              )
            )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .order('payment_date', { ascending: false })
      .limit(300)

    if (error) {
      throw error
    }

    const tenantIds = Array.from(
      new Set((data || []).map((payment) => payment.tenant_user_id).filter((id): id is string => Boolean(id)))
    )
    const verifiedIds = Array.from(
      new Set((data || []).map((payment) => payment.verified_by).filter((id): id is string => Boolean(id)))
    )

    let tenantMap = new Map<string, { full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length > 0) {
      const { data: tenantProfiles } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .in('id', tenantIds)

      tenantMap = new Map(
        (tenantProfiles || []).map((profile) => [profile.id, { full_name: profile.full_name, phone_number: profile.phone_number }])
      )
    }

    let verifiedMap = new Map<string, string | null>()
    if (verifiedIds.length > 0) {
      const { data: verifiedProfiles } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .in('id', verifiedIds)

      verifiedMap = new Map((verifiedProfiles || []).map((profile) => [profile.id, profile.full_name]))
    }

    // Build signed URLs for deposit slips if needed
    const depositUrlMap = new Map<string, string>()
    for (const row of data || []) {
      const url = row.deposit_slip_url as string | null
      const signed = await getSignedDepositUrl(adminSupabase, url || undefined)
      if (signed) {
        depositUrlMap.set(row.id, signed)
      }
    }

    let mapped = (data || []).map((payment) =>
      mapPayment(payment, {
        tenantMap,
        verifiedMap,
        depositUrlMap,
      })
    )

    if (role === 'caretaker' && propertyId) {
      mapped = mapped.filter((payment) => payment.propertyId === propertyId)
    }

    const failed = mapped.filter(isFailure)
    const failedIds = new Set(failed.map((payment) => payment.id))
    const pending = mapped.filter((payment) => !payment.verified && !failedIds.has(payment.id))
    const verified = mapped.filter((payment) => payment.verified)

    const rejectedFlag = (notes?: string | null) => (notes || '').toLowerCase().includes('[rejected')
    const pendingDeposits = pending.filter(
      (payment) => payment.paymentMethod === 'bank_transfer' && !rejectedFlag(payment.notes)
    )
    const confirmedDeposits = verified.filter((payment) => payment.paymentMethod === 'bank_transfer')
    const rejectedDeposits = pending.filter(
      (payment) => payment.paymentMethod === 'bank_transfer' && rejectedFlag(payment.notes)
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
      autoVerifyEnabled: settings.auto_verify_enabled,
      autoVerifyFrequencySeconds: settings.auto_verify_frequency_seconds,
      maxRetries: settings.max_retries,
      queryTimeoutSeconds: settings.query_timeout_seconds,
      lastTestedAt: settings.last_tested_at,
      lastTestStatus: settings.last_test_status,
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

    const settings = await getMpesaSettings()

    const result = await autoVerifyMpesaPayments(settings)

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
