import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>
type ManagerContextResult = { admin: AdminClient; orgId: string } | { error: NextResponse }

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
  coverage_label?: string | null
}

type StatementPayload = {
  tenant: {
    id: string
    name: string
    phone_number: string | null
    email: string | null
    profile_picture_url: string | null
  }
  lease: {
    id: string
    status: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    rent_paid_until: string | null
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  period: { start: string | null; end: string | null }
  summary: {
    openingBalance: number
    closingBalance: number
    totalCharges: number
    totalPayments: number
  }
  transactions: StatementTransaction[]
}

async function getManagerContext(): Promise<ManagerContextResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      ),
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load organization.' }, { status: 500 }) }
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load profile.' }, { status: 500 }) }
  }

  const orgId = membership?.organization_id || profile?.organization_id
  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }) }
  }

  const role = (membership?.role || profile?.role || '') as (typeof MANAGER_ROLES)[number] | ''
  if (!role || !MANAGER_ROLES.includes(role)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, orgId }
}

function resolveTenantUserId(request: NextRequest, params?: { tenantUserId?: string }) {
  if (params?.tenantUserId) return params.tenantUserId
  return request.nextUrl.searchParams.get('tenantUserId') || request.nextUrl.searchParams.get('tenantId')
}

function normalizeRpcRows(data: unknown): any[] {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const record = data as Record<string, unknown>
  if (Array.isArray(record.rows)) return record.rows as any[]
  if (Array.isArray(record.transactions)) return record.transactions as any[]
  return []
}

function isStatementPayload(value: unknown): value is StatementPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as any
  return (
    record &&
    typeof record === 'object' &&
    record.tenant &&
    typeof record.tenant === 'object' &&
    typeof record.tenant.id === 'string' &&
    Array.isArray(record.transactions) &&
    record.summary &&
    typeof record.summary === 'object'
  )
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length) return value
  return null
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toStatementTransaction(row: any, fallbackId: string): StatementTransaction {
  const entryType = coerceString(row?.entry_type)

  const debit = coerceNumber(row?.debit) ?? 0
  const credit = coerceNumber(row?.credit) ?? 0

  const kindRaw = coerceString(row?.kind) || coerceString(row?.type) || coerceString(row?.transaction_kind)
  const kind: StatementTransaction['kind'] =
    entryType === 'payment'
      ? 'payment'
      : entryType === 'invoice'
        ? 'charge'
        : kindRaw === 'payment' || kindRaw === 'charge'
          ? (kindRaw as StatementTransaction['kind'])
          : debit - credit < 0
            ? 'payment'
            : 'charge'

  const paymentType =
    coerceString(row?.payment_type) ||
    coerceString(row?.invoice_type) ||
    coerceString(row?.category) ||
    (kind === 'payment' ? 'payment' : 'rent')

  const paymentMethod = coerceString(row?.payment_method) || coerceString(row?.method)

  const status =
    coerceString(row?.status) ||
    coerceString(row?.status_text) ||
    coerceString(row?.payment_status) ||
    (row?.verified === true ? 'verified' : 'posted')

  const postedAt =
    coerceString(row?.posted_at) ||
    coerceString(row?.entry_date) ||
    coerceString(row?.payment_date) ||
    coerceString(row?.due_date) ||
    coerceString(row?.created_at)

  const description =
    coerceString(row?.description) ||
    coerceString(row?.narration) ||
    coerceString(row?.memo) ||
    (kind === 'payment' ? 'Payment' : 'Charge')

  const reference =
    coerceString(row?.reference) ||
    coerceString(row?.mpesa_receipt_number) ||
    coerceString(row?.bank_reference_number) ||
    coerceString(row?.receipt_number) ||
    null

  const id =
    coerceString(row?.id) ||
    coerceString(row?.transaction_id) ||
    coerceString(row?.payment_id) ||
    coerceString(row?.invoice_id) ||
    coerceString(row?.source_id) ||
    fallbackId

  const netAmount =
    coerceNumber(row?.amount) ??
    coerceNumber(row?.net_amount) ??
    coerceNumber(row?.debit_minus_credit) ??
    debit - credit

  const normalizedAmount = kind === 'payment' ? -Math.abs(netAmount) : Math.abs(netAmount)

  const balanceAfter =
    coerceNumber(row?.balance_after) ??
    coerceNumber(row?.running_balance) ??
    coerceNumber(row?.balance)
  const coverageLabel =
    coerceString(row?.coverage_label) || coerceString(row?.coverageLabel) || coerceString(row?.coverage)

  return {
    id,
    kind,
    payment_type: paymentType,
    payment_method: paymentMethod,
    status,
    posted_at: postedAt,
    description,
    reference,
    amount: normalizedAmount,
    balance_after: balanceAfter ?? undefined,
    coverage_label: coverageLabel ?? undefined,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tenantUserId: string } }
) {
  try {
    const tenantUserId = resolveTenantUserId(request, params)
    if (!tenantUserId) {
      return NextResponse.json({ success: false, error: 'Tenant user id is required.' }, { status: 400 })
    }

    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }

    const { admin, orgId } = ctx

    const { data: tenantProfile, error: tenantError } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url')
      .eq('id', tenantUserId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (tenantError) {
      throw tenantError
    }
    if (!tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant not found.' }, { status: 404 })
    }

    const leaseId =
      request.nextUrl.searchParams.get('leaseId') || request.nextUrl.searchParams.get('lease_id') || null

    const { data: lease, error: leaseError } = await admin
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
          unit_number,
          building:apartment_buildings (
            name,
            location
          )
        )
      `
      )
      .eq('tenant_user_id', tenantUserId)
      .eq('organization_id', orgId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    const { data, error } = await admin.rpc('get_tenant_statement', {
      p_organization_id: orgId,
      p_tenant_user_id: tenantUserId,
      p_lease_id: leaseId,
    })

    if (error) {
      console.error('[ManagerStatement] RPC get_tenant_statement failed', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (isStatementPayload(data)) {
      return NextResponse.json({ success: true, data, rows: normalizeRpcRows(data) })
    }

    const rawRows = normalizeRpcRows(data)
    const mappedTransactions = rawRows.map((row, index) =>
      toStatementTransaction(row, `row-${index + 1}`)
    )

    mappedTransactions.sort((a, b) => {
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

    const transactions: StatementTransaction[] = mappedTransactions.map((transaction) => {
      const providedBalance = typeof transaction.balance_after === 'number' ? transaction.balance_after : null
      if (providedBalance !== null && Number.isFinite(providedBalance)) {
        runningBalance = providedBalance
      } else {
        runningBalance += transaction.amount
      }

      if (transaction.amount >= 0) {
        totalCharges += transaction.amount
      } else {
        totalPayments += Math.abs(transaction.amount)
      }

      return {
        ...transaction,
        balance_after: runningBalance,
      }
    })

    const periodStart = transactions.length > 0 ? transactions[0].posted_at : null
    const periodEnd = transactions.length > 0 ? transactions[transactions.length - 1].posted_at : null

    const payload: StatementPayload = {
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
            status: lease.status || null,
            start_date: lease.start_date,
            end_date: lease.end_date,
            monthly_rent: lease.monthly_rent ? Number(lease.monthly_rent) : null,
            rent_paid_until: lease.rent_paid_until,
            property_name: (lease as any).unit?.building?.name || null,
            property_location: (lease as any).unit?.building?.location || null,
            unit_number: (lease as any).unit?.unit_number || null,
          }
        : null,
      period: { start: periodStart, end: periodEnd },
      summary: {
        openingBalance: 0,
        closingBalance: runningBalance,
        totalCharges,
        totalPayments,
      },
      transactions,
    }

    return NextResponse.json({ success: true, data: payload, rows: rawRows })
  } catch (error) {
    console.error('[ManagerStatement] Failed to load tenant statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant statement.' },
      { status: 500 }
    )
  }
}
