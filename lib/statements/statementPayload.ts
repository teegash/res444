export type StatementTransaction = {
  id: string
  kind: 'charge' | 'payment'
  payment_type: string
  payment_method: string | null
  status: string
  verified?: boolean
  posted_at: string | null
  description: string
  reference: string | null
  amount: number
  balance_after?: number
  coverage_label?: string | null
}

export type StatementPayload = {
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

export type StatementTenantProfile = {
  id: string
  full_name: string | null
  phone_number: string | null
  profile_picture_url: string | null
}

export type StatementLeaseRecord = {
  id: string
  status: string | null
  start_date: string | null
  end_date: string | null
  monthly_rent: number | string | null
  rent_paid_until: string | null
  unit?: {
    unit_number: string | null
    building?: {
      name: string | null
      location: string | null
    } | null
  } | null
} | null

function normalizeRpcRows(data: unknown): any[] {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const record = data as Record<string, unknown>
  if (Array.isArray(record.rows)) return record.rows as any[]
  if (Array.isArray(record.transactions)) return record.transactions as any[]
  return []
}

function isFailedPaymentStatus(status: string | null | undefined) {
  if (!status) return false
  const normalized = status.toLowerCase()
  return ['failed', 'cancelled', 'canceled', 'void', 'reversed', 'rejected', 'timeout', 'expired'].some((key) =>
    normalized.includes(key)
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

  const notes = coerceString(row?.notes) || coerceString(row?.payment_notes)
  let status =
    coerceString(row?.status) ||
    coerceString(row?.status_text) ||
    coerceString(row?.payment_status) ||
    coerceString(row?.mpesa_query_status) ||
    null
  if (!status && notes && /reject/i.test(notes)) {
    status = 'rejected'
  }
  if (!status) {
    status = row?.verified === true ? 'verified' : 'posted'
  }
  const verified = row?.verified === true || status.toLowerCase().includes('verified')

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

  const id =
    coerceString(row?.id) ||
    coerceString(row?.transaction_id) ||
    coerceString(row?.payment_id) ||
    coerceString(row?.invoice_id) ||
    coerceString(row?.source_id) ||
    fallbackId

  const directReference =
    coerceString(row?.reference) ||
    coerceString(row?.mpesa_receipt_number) ||
    coerceString(row?.bank_reference_number) ||
    coerceString(row?.receipt_number) ||
    null

  const referenceFallbackSource =
    coerceString(row?.source_id) ||
    coerceString(row?.invoice_id) ||
    coerceString(row?.payment_id) ||
    coerceString(row?.transaction_id) ||
    null

  const uuidish = typeof id === 'string' && /^[0-9a-f]{8}-/i.test(id) ? id : null
  const reference =
    directReference ||
    (referenceFallbackSource ? referenceFallbackSource.slice(0, 8).toUpperCase() : null) ||
    (uuidish ? uuidish.slice(0, 8).toUpperCase() : null)

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
    verified,
    posted_at: postedAt,
    description,
    reference,
    amount: normalizedAmount,
    balance_after: balanceAfter ?? undefined,
    coverage_label: coverageLabel ?? undefined,
  }
}

export function buildStatementPayloadFromRpc(args: {
  tenantProfile: StatementTenantProfile
  lease: StatementLeaseRecord
  rpcData: unknown
}): { payload: StatementPayload; rawRows: any[] } {
  const rawRows = normalizeRpcRows(args.rpcData)
  const mappedTransactions = rawRows
    .map((row, index) => toStatementTransaction(row, `row-${index + 1}`))
    .filter((transaction) =>
      transaction.kind === 'payment'
        ? transaction.verified === true && !isFailedPaymentStatus(transaction.status)
        : true
    )

  mappedTransactions.sort((a, b) => {
    const toDateKey = (value?: string | null) => {
      if (!value) return ''
      const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
      if (match) return match[0]
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return ''
      return parsed.toISOString().slice(0, 10)
    }
    const toTimeKey = (value?: string | null) => {
      if (!value) return 0
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return 0
      return parsed.getTime()
    }

    const aDate = toDateKey(a.posted_at)
    const bDate = toDateKey(b.posted_at)
    if (aDate === bDate) {
      if (a.kind !== b.kind) return a.kind === 'charge' ? -1 : 1
      const aTime = toTimeKey(a.posted_at)
      const bTime = toTimeKey(b.posted_at)
      if (aTime === bTime) return 0
      return aTime - bTime
    }
    if (!aDate) return 1
    if (!bDate) return -1
    return aDate.localeCompare(bDate)
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

  const lease = args.lease

  const payload: StatementPayload = {
    tenant: {
      id: args.tenantProfile.id,
      name: args.tenantProfile.full_name || 'Tenant',
      phone_number: args.tenantProfile.phone_number || null,
      email: null,
      profile_picture_url: args.tenantProfile.profile_picture_url || null,
    },
    lease: lease
      ? {
          id: lease.id,
          status: lease.status || null,
          start_date: lease.start_date,
          end_date: lease.end_date,
          monthly_rent: lease.monthly_rent !== null ? Number(lease.monthly_rent) : null,
          rent_paid_until: lease.rent_paid_until,
          property_name: lease.unit?.building?.name || null,
          property_location: lease.unit?.building?.location || null,
          unit_number: lease.unit?.unit_number || null,
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

  return { payload, rawRows }
}
