'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { addMonthsUtc, startOfMonthUtc, toIsoDate } from '@/lib/invoices/rentPeriods'
import { invoiceStatusToBoolean } from '@/lib/invoices/status-utils'
import { calculatePaidUntil } from '@/lib/payments/leaseHelpers'

type AdminClient = ReturnType<typeof createAdminClient>

const UNPAID_STATUSES = new Set(['unpaid', 'overdue', 'partially_paid'])
const AMOUNT_TOLERANCE = 0.05
const DUPLICATE_LOOKBACK_HOURS = 24
const MAX_PAST_PAYMENT_DAYS = 180
const UNPAID_OR_FALSE = 'status.eq.false,status.eq.unpaid,status.eq.overdue,status.eq.partially_paid'

interface LeaseRecord {
  id: string
  tenant_user_id: string
  monthly_rent: number | string
  status: string
  start_date: string
  end_date: string | null
  rent_paid_until?: string | null
  next_rent_due_date?: string | null
}

interface InvoiceRecord {
  id: string
  lease_id: string
  due_date: string
  status: string | boolean | null
  amount: number | string
  payment_date?: string | null
  invoice_type?: 'rent' | 'water'
  months_covered?: number | null
}

interface PaymentRecord {
  id: string
  invoice_id: string | null
  tenant_user_id: string
  amount_paid: number | string
  payment_date: string | null
  months_paid: number | null
  notes?: string | null
  verified: boolean | null
}

export interface ProcessRentPrepaymentInput {
  paymentId: string
  leaseId: string
  tenantUserId: string
  amountPaid: number
  monthsPaid: number
  paymentDate: Date
  paymentMethod: 'mpesa' | 'bank_transfer' | 'cash' | 'cheque'
}

export interface ProcessRentPrepaymentResult {
  success: boolean
  message: string
  validationErrors: string[]
  appliedInvoices: string[]
  createdInvoices: string[]
  nextDueDate: Date | null
  nextDueAmount: number | null
  paidUpToMonth?: string | null
  previouslyPaidUpToMonth?: string | null
  nextRentDueDate?: string | null
  cumulativePrepaidMonths?: number
}

export interface AutoCreateMissingInvoicesOptions {
  leaseIds?: string[]
  forceRecreate?: boolean
}

export interface AutoCreateMissingInvoicesResult {
  success: boolean
  processedLeases: number
  invoicesCreated: number
  invoicesSkipped: number
  errors: Array<{ leaseId: string; error: string }>
}

export interface NextDueDateResult {
  nextDueDate: Date | null
  nextAmount: number | null
  unpaidCount: number
  totalOwed: number
  paidUpToDate?: Date | null
  cumulativePrepaidMonths?: number
  prepaidUntilMonth?: string | null
}

export interface ValidatePrepaymentInput {
  leaseId: string
  amountPaid: number
  monthsPaid: number
  paymentDate: Date
}

export interface ValidatePrepaymentResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  expectedAmount: number
  unpaidInvoiceCount: number
  coversMonths: string[]
  projectedNextDueDate?: Date | null
  currentPrepaidMonths?: number
  totalPrepaidAfterPayment?: number
  cumulativeMessage?: string
}

const todayUtc = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toDateOnlyIso = (value: Date): string => value.toISOString().split('T')[0]
const describeCoverage = (dueIso: string, months: number) => {
  const monthLabel = new Date(dueIso).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  return months > 1 ? `Rent for ${monthLabel} (covers ${months} months)` : `Rent for ${monthLabel}`
}

// Apply a verified rent payment to invoice + lease pointers
export async function applyRentPayment(
  admin: AdminClient,
  payment: { id?: string; months_paid?: number | null },
  invoice: { id: string; due_date: string },
  lease: { id: string }
) {
  const months = payment.months_paid && Number(payment.months_paid) > 0 ? Number(payment.months_paid) : 1
  const baseMonth = startOfMonthUtc(new Date(invoice.due_date))
  const paidUntil = addMonthsUtc(baseMonth, months - 1)

  // Mark invoice payment metadata (trigger will handle status)
  await admin
    .from('invoices')
    .update({
      payment_date: new Date().toISOString(),
      months_covered: months,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)

  // Sync payment row (if provided) so payment/invoice statuses stay aligned
  if (payment?.id) {
    await admin
      .from('payments')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        months_paid: months,
      })
      .eq('id', payment.id)
  }

  // Advance lease pointers
  await admin
    .from('leases')
    .update({
      rent_paid_until: toIsoDate(paidUntil),
      next_rent_due_date: toIsoDate(addMonthsUtc(paidUntil, 1)),
    })
    .eq('id', lease.id)

  return paidUntil
}

const normalizeCurrency = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return 0
}

const clampMonthsPaid = (months: number): number => Math.max(1, Math.floor(months))

const buildDueDates = (
  start: Date,
  months: number,
  dueDay: number,
  leaseEnd?: string | null
): string[] => {
  const results: string[] = []
  let cursor = startOfMonthUtc(start)
  const endCap = leaseEnd ? startOfMonthUtc(new Date(leaseEnd)) : null

  for (let i = 0; i < months; i += 1) {
    if (endCap && cursor > endCap) {
      break
    }

    const due = new Date(cursor)
    const monthEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0))
    const clampDay = Math.min(dueDay, monthEnd.getUTCDate())
    due.setUTCDate(clampDay)
    results.push(toIsoDate(due))
    cursor = addMonthsUtc(cursor, 1)
  }

  return results
}

const resolveCoverageStart = (lease: LeaseRecord): Date => {
  const leaseStart = lease.start_date ? startOfMonthUtc(new Date(lease.start_date)) : startOfMonthUtc(todayUtc())
  const pointer = parseDate(lease.next_rent_due_date)
  if (pointer) {
    const start = startOfMonthUtc(pointer)
    return start < leaseStart ? leaseStart : start
  }
  const paid = parseDate(lease.rent_paid_until)
  if (paid) {
    const next = addMonthsUtc(startOfMonthUtc(paid), 1)
    return next < leaseStart ? leaseStart : next
  }
  const current = startOfMonthUtc(todayUtc())
  return current < leaseStart ? leaseStart : current
}

const fetchOldestUnpaidInvoice = async (admin: AdminClient, leaseId: string) => {
  const { data } = await admin
    .from('invoices')
    .select('id, lease_id, due_date, amount, status, payment_date')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .or(UNPAID_OR_FALSE)
    .order('due_date', { ascending: true })
    .limit(1)
  return data?.[0] ?? null
}

const fetchLatestInvoice = async (admin: AdminClient, leaseId: string) => {
  const { data } = await admin
    .from('invoices')
    .select('id, lease_id, due_date, amount, status')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .order('due_date', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

const fetchUnpaidInvoices = async (admin: AdminClient, leaseId: string) => {
  const { data } = await admin
    .from('invoices')
    .select('id, lease_id, due_date, amount, status')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .or(UNPAID_OR_FALSE)
    .order('due_date', { ascending: true })
  return data ?? []
}

const monthKey = (dateIso: string) => dateIso.slice(0, 7)

const fetchInvoicesForRange = async (
  admin: AdminClient,
  leaseId: string,
  startDateIso: string,
  endDateIso: string
) => {
  const { data } = await admin
    .from('invoices')
    .select('id, lease_id, due_date, amount, status, payment_date')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .gte('due_date', startDateIso)
    .lte('due_date', endDateIso)
    .order('due_date', { ascending: true })
  return data ?? []
}

const fetchProcessedInvoiceChain = async (
  admin: AdminClient,
  leaseId: string,
  firstInvoiceId: string,
  months: number
) => {
  const { data: firstInvoice } = await admin
    .from('invoices')
    .select('id, due_date')
    .eq('id', firstInvoiceId)
    .single()

  if (!firstInvoice?.due_date) {
    return []
  }

  const start = parseDate(firstInvoice.due_date)
  if (!start) {
    return [firstInvoiceId]
  }

  const dueDates = buildDueDates(start, months, start.getUTCDate())
  if (!dueDates.length) {
    return [firstInvoiceId]
  }

  const invoices = await fetchInvoicesForRange(admin, leaseId, dueDates[0], dueDates[dueDates.length - 1])
  return invoices.slice(0, months).map((invoice) => invoice.id)
}

const ensurePaymentRecency = (paymentDate: Date, errors: string[]) => {
  const now = todayUtc()
  if (paymentDate.getTime() > now.getTime()) {
    errors.push('Payment date cannot be in the future.')
  }

  const cutoff = new Date(now.getTime())
  cutoff.setUTCDate(cutoff.getUTCDate() - MAX_PAST_PAYMENT_DAYS)
  if (paymentDate.getTime() < cutoff.getTime()) {
    errors.push('Payment date is older than 180 days and cannot be processed automatically.')
  }
}

const detectDuplicatePayment = async (
  admin: AdminClient,
  tenantId: string,
  paymentId: string,
  paymentDate: Date,
  amountPaid: number,
  errors: string[]
) => {
  const lower = new Date(paymentDate.getTime())
  lower.setUTCHours(lower.getUTCHours() - DUPLICATE_LOOKBACK_HOURS)
  const upper = new Date(paymentDate.getTime())
  upper.setUTCHours(upper.getUTCHours() + DUPLICATE_LOOKBACK_HOURS)

  const { data } = await admin
    .from('payments')
    .select('id, amount_paid, payment_date')
    .eq('tenant_user_id', tenantId)
    .neq('id', paymentId)
    .gte('payment_date', lower.toISOString())
    .lte('payment_date', upper.toISOString())

  if (!data?.length) {
    return
  }

  const lowerAmount = amountPaid * (1 - AMOUNT_TOLERANCE)
  const upperAmount = amountPaid * (1 + AMOUNT_TOLERANCE)
  const duplicate = data.find((row) => {
    const value = normalizeCurrency(row.amount_paid)
    return value >= lowerAmount && value <= upperAmount
  })

  if (duplicate) {
    errors.push('A similar payment was logged within the last 24 hours. Review duplicates before proceeding.')
  }
}

const validateAmount = (
  amountPaid: number,
  monthsPaid: number,
  monthlyRent: number,
  errors: string[],
  warnings: string[]
) => {
  const expected = monthlyRent * monthsPaid
  const variance = expected * AMOUNT_TOLERANCE
  const delta = amountPaid - expected

  if (Math.abs(delta) > variance) {
    errors.push(
      `Payment amount ${amountPaid.toLocaleString()} does not match the expected ${expected.toLocaleString()} for ${monthsPaid} month(s).`
    )
  } else if (delta > 0) {
    warnings.push(
      `Overpayment detected: +KES ${delta.toFixed(2)} will still be applied to the covered months.`
    )
  } else if (delta < 0) {
    warnings.push(
      `Underpayment detected: -KES ${Math.abs(delta).toFixed(2)} may leave part of a month unpaid.`
    )
  }

  return expected
}

const ensureLeaseActive = (lease: LeaseRecord, errors: string[]) => {
  if (!lease) {
    errors.push('Lease not found.')
    return
  }
  if (lease.status !== 'active' && lease.status !== 'pending') {
    errors.push('Lease is not active and cannot accept payments.')
  }
}

const validateMonthsRequest = (monthsPaid: number, errors: string[], warnings: string[], unpaidCount: number) => {
  if (monthsPaid > 12) {
    warnings.push('Large prepayment detected (over 12 months). Ensure tenant intent is confirmed.')
  } else if (monthsPaid > 6) {
    warnings.push('Large prepayment detected (6+ months). Confirm tenant intent.')
  }

  if (monthsPaid > unpaidCount) {
    warnings.push('Prepayment exceeds current unpaid invoices. Future invoices will be generated to absorb the payment.')
  }
}

const computeNextDueDateInternal = async (admin: AdminClient, leaseId: string): Promise<NextDueDateResult> => {
  const [{ data: lease }, { data: unpaidInvoices }, { data: latestPaid }, { count: prepaidCount }] =
    await Promise.all([
      admin
        .from('leases')
        .select('next_rent_due_date, monthly_rent')
        .eq('id', leaseId)
        .maybeSingle(),
      admin
        .from('invoices')
        .select('id, due_date, amount, status')
        .eq('lease_id', leaseId)
        .eq('invoice_type', 'rent')
        .or(UNPAID_OR_FALSE)
        .order('due_date', { ascending: true }),
      admin
        .from('invoices')
        .select('due_date')
        .eq('lease_id', leaseId)
        .eq('invoice_type', 'rent')
        .or('status.eq.true,status.eq.paid')
        .order('due_date', { ascending: false })
        .limit(1),
      admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('lease_id', leaseId)
        .eq('invoice_type', 'rent')
        .or('status.eq.true,status.eq.paid'),
    ])

  const pointer = parseDate((lease as any)?.next_rent_due_date)
  const monthlyRent = normalizeCurrency((lease as any)?.monthly_rent)
  const unpaid = unpaidInvoices ?? []

  const unpaidCount = unpaid.length
  const totalOwed = unpaid.reduce((total, row) => total + normalizeCurrency(row.amount), 0)
  const nextInvoice = unpaid[0]
  const nextDueDate = nextInvoice?.due_date ? parseDate(nextInvoice.due_date) : pointer
  const nextAmount = nextInvoice ? normalizeCurrency(nextInvoice.amount) : monthlyRent || null
  const paidUpToDate =
    latestPaid && latestPaid.length && latestPaid[0]?.due_date ? parseDate(latestPaid[0].due_date) : null

  return {
    nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
    nextAmount,
    unpaidCount,
    totalOwed,
    paidUpToDate: paidUpToDate ? new Date(paidUpToDate) : null,
    cumulativePrepaidMonths: prepaidCount ?? undefined,
    prepaidUntilMonth: paidUpToDate
      ? new Date(paidUpToDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : null,
  }
}

export async function getNextDueDate(leaseId: string): Promise<NextDueDateResult> {
  const admin = createAdminClient()
  return computeNextDueDateInternal(admin, leaseId)
}

export async function processRentPrepayment(
  input: ProcessRentPrepaymentInput
): Promise<ProcessRentPrepaymentResult> {
  const admin = createAdminClient()
  const validationErrors: string[] = []
  const warnings: string[] = []

  try {
    console.info('[Prepayment] start', {
      paymentId: input.paymentId,
      leaseId: input.leaseId,
      monthsPaid: input.monthsPaid,
      amountPaid: input.amountPaid,
    })

    const [{ data: lease, error: leaseError }, { data: payment, error: paymentError }] = await Promise.all([
      admin
        .from('leases')
        .select(
          'id, tenant_user_id, monthly_rent, status, start_date, end_date, rent_paid_until, next_rent_due_date'
        )
        .eq('id', input.leaseId)
        .maybeSingle(),
      admin
        .from('payments')
        .select('id, invoice_id, tenant_user_id, amount_paid, payment_date, months_paid, notes, verified')
        .eq('id', input.paymentId)
        .maybeSingle(),
    ])

    if (leaseError || !lease) {
      return {
        success: false,
        message: leaseError?.message || 'Lease not found.',
        validationErrors: ['Lease record missing.'],
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    ensureLeaseActive(lease as LeaseRecord, validationErrors)

    if (paymentError || !payment) {
      validationErrors.push('Payment record not found.')
    } else if (payment.tenant_user_id !== input.tenantUserId) {
      validationErrors.push('Payment tenant does not match lease tenant.')
    }

    if (validationErrors.length) {
      return {
        success: false,
        message: 'Unable to validate payment.',
        validationErrors,
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    const paymentRecord = payment as PaymentRecord
    const leaseRecord = lease as LeaseRecord
    const monthlyRent = normalizeCurrency(leaseRecord.monthly_rent)
    const amountPaid = input.amountPaid

    // Derive monthsPaid (respect stored value; cap at 3)
    const derivedMonths =
      input.monthsPaid && Number.isFinite(input.monthsPaid)
        ? Number(input.monthsPaid)
        : monthlyRent > 0
          ? amountPaid / monthlyRent
          : 1
    const monthsPaid = Math.min(3, clampMonthsPaid(derivedMonths))
    const paymentDate = input.paymentDate
    const previousPaidPointer = leaseRecord.next_rent_due_date || null

    ensurePaymentRecency(paymentDate, validationErrors)
    await detectDuplicatePayment(admin, input.tenantUserId, input.paymentId, paymentDate, amountPaid, validationErrors)

    const expectedAmount = validateAmount(amountPaid, monthsPaid, monthlyRent, validationErrors, warnings)

    if (normalizeCurrency(paymentRecord.amount_paid) !== amountPaid) {
      validationErrors.push('Payment amount mismatch with stored payment record.')
    }

    if (validationErrors.length) {
      return {
        success: false,
        message: 'Payment validation failed.',
        validationErrors,
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    const PREPAYMENT_FLAG = '[prepayment_applied]'
    if (paymentRecord.notes?.includes(PREPAYMENT_FLAG)) {
      const applied = await fetchProcessedInvoiceChain(
        admin,
        input.leaseId,
        paymentRecord.invoice_id || input.paymentId,
        paymentRecord.months_paid || monthsPaid
      )
      const nextDue = await computeNextDueDateInternal(admin, input.leaseId)
      return {
        success: true,
        message: 'Payment already processed.',
        validationErrors: [],
        appliedInvoices: applied,
        createdInvoices: [],
        nextDueDate: nextDue.nextDueDate,
        nextDueAmount: nextDue.nextAmount,
        paidUpToMonth: nextDue.prepaidUntilMonth || null,
        previouslyPaidUpToMonth: null,
        nextRentDueDate: leaseRecord.next_rent_due_date || null,
        cumulativePrepaidMonths: nextDue.cumulativePrepaidMonths,
      }
    }

    const unpaidInvoices = await fetchUnpaidInvoices(admin, input.leaseId)
    validateMonthsRequest(monthsPaid, validationErrors, warnings, unpaidInvoices.length)

    if (validationErrors.length) {
      return {
        success: false,
        message: 'Unable to process rent prepayment.',
        validationErrors,
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    // Compute coverage months starting from the next due/coverage pointer
    const coverageStart = resolveCoverageStart(leaseRecord)
    const candidateDueDates = buildDueDates(coverageStart, monthsPaid, 1, leaseRecord.end_date)
    if (!candidateDueDates.length) {
      return {
        success: false,
        message: 'No valid months to cover.',
        validationErrors: ['No valid months to cover.'],
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    const baseDueDateIso = candidateDueDates[0]

    // Upsert a single invoice covering the span
    const { data: baseInvoice, error: upsertError } = await admin
      .from('invoices')
      .upsert(
        {
          lease_id: leaseRecord.id,
          invoice_type: 'rent',
          amount: monthlyRent,
          due_date: baseDueDateIso,
          months_covered: monthsPaid,
          status: true,
          payment_date: input.paymentDate.toISOString(),
          description: describeCoverage(baseDueDateIso, monthsPaid),
        },
        { onConflict: 'lease_id,invoice_type,due_date', returning: 'representation' }
      )
      .single()

    if (upsertError || !baseInvoice) {
      return {
        success: false,
        message: 'Unable to process rent prepayment.',
        validationErrors: ['Failed to upsert invoice.'],
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    // Mark any other invoices in the covered range as paid to keep UI clean
    if (candidateDueDates.length > 1) {
      const rest = candidateDueDates.slice(1)
      await admin
        .from('invoices')
        .update({ status: true })
        .eq('lease_id', leaseRecord.id)
        .eq('invoice_type', 'rent')
        .in('due_date', rest)
    }

    // Update payments table with months_paid and mark verified
    await admin.from('payments').update({ months_paid: monthsPaid, verified: true }).eq('id', input.paymentId)

    // Update lease paid-until and next due pointers
    const basePaidUntil = addMonthsUtc(startOfMonthUtc(new Date(baseDueDateIso)), monthsPaid - 1)
    const newPaidUntilIso = toIsoDate(basePaidUntil)
    const nextPointer = addMonthsUtc(basePaidUntil, 1)
    await admin
      .from('leases')
      .update({
        rent_paid_until: newPaidUntilIso,
        next_rent_due_date: toIsoDate(nextPointer),
      })
      .eq('id', leaseRecord.id)

    const nextDue = await computeNextDueDateInternal(admin, leaseRecord.id)

    // Mark payment with flag to avoid reprocessing
    const existingNotes = paymentRecord.notes || ''
    if (!existingNotes.includes(PREPAYMENT_FLAG)) {
      await admin
        .from('payments')
        .update({
          notes: `${existingNotes ? `${existingNotes} ` : ''}${PREPAYMENT_FLAG}`.trim(),
          months_paid: monthsPaid,
          verified: true,
        })
        .eq('id', input.paymentId)
    }

    const coverageLabels = candidateDueDates.map((d) => {
      const monthLabel = new Date(d).toLocaleString('en-US', { month: 'short' })
      return `COV ${monthLabel}`
    })

    return {
      success: true,
      message: warnings.length ? `Processed with warnings: ${warnings.join(' ')}` : 'Rent prepayment applied.',
      validationErrors: [],
      appliedInvoices: [baseInvoice.id],
      createdInvoices: [baseInvoice.id],
      nextDueDate: nextDue.nextDueDate,
      nextDueAmount: nextDue.nextAmount,
      paidUpToMonth: candidateDueDates[candidateDueDates.length - 1],
      previouslyPaidUpToMonth: previousPaidPointer,
      nextRentDueDate: nextDue.nextDueDate,
      cumulativePrepaidMonths: monthsPaid,
    }
  } catch (error) {
    console.error('[processRentPrepayment] failed', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to process rent prepayment.',
      validationErrors: validationErrors.length ? validationErrors : ['Unexpected error processing payment.'],
      appliedInvoices: [],
      createdInvoices: [],
      nextDueDate: null,
      nextDueAmount: null,
    }
  }
}

export async function autoCreateMissingInvoices(
  options: AutoCreateMissingInvoicesOptions = {}
): Promise<AutoCreateMissingInvoicesResult> {
  const admin = createAdminClient()
  const errors: Array<{ leaseId: string; error: string }> = []
  let processedLeases = 0
  let invoicesCreated = 0
  let invoicesSkipped = 0

  const query = admin
    .from('leases')
    .select('id, tenant_user_id, monthly_rent, status, start_date, end_date, next_rent_due_date')
    .eq('status', 'active')

  if (options.leaseIds?.length) {
    query.in('id', options.leaseIds)
  }

  const { data: leases, error } = await query
  if (error) {
    return {
      success: false,
      processedLeases: 0,
      invoicesCreated: 0,
      invoicesSkipped: 0,
      errors: [{ leaseId: 'all', error: error.message }],
    }
  }

  for (const leaseRow of leases ?? []) {
    processedLeases += 1
    const lease = leaseRow as LeaseRecord
    const monthlyRent = normalizeCurrency(lease.monthly_rent)

    try {
      const today = startOfMonthUtc(todayUtc())
      const pointer = lease.next_rent_due_date
        ? startOfMonthUtc(new Date(lease.next_rent_due_date))
        : lease.start_date
          ? startOfMonthUtc(new Date(lease.start_date))
          : today

      const leaseEndCap = lease.end_date ? startOfMonthUtc(new Date(lease.end_date)) : null
      if (leaseEndCap && pointer > leaseEndCap) {
        invoicesSkipped += 1
        continue
      }

      if (pointer > today) {
        invoicesSkipped += 1
        continue
      }

      const { data: existingInvoice } = await admin
        .from('invoices')
        .select('id, status')
        .eq('lease_id', lease.id)
        .eq('invoice_type', 'rent')
        .eq('due_date', toIsoDate(pointer))
        .maybeSingle()

      if (existingInvoice && !options.forceRecreate) {
        invoicesSkipped += 1
        continue
      }

      const { error: insertError } = await admin
        .from('invoices')
        .upsert(
          {
            lease_id: lease.id,
            invoice_type: 'rent',
            amount: monthlyRent,
            due_date: toIsoDate(pointer),
            status: false,
            months_covered: 1,
          },
          { onConflict: 'lease_id,invoice_type,due_date' }
        )

      if (insertError) {
        throw insertError
      }

      const nextPointer = addMonthsUtc(pointer, 1)
      await admin
        .from('leases')
        .update({ next_rent_due_date: toIsoDate(nextPointer) })
        .eq('id', lease.id)

      invoicesCreated += 1
    } catch (leaseError) {
      errors.push({ leaseId: lease.id, error: leaseError instanceof Error ? leaseError.message : 'Failed to create invoices.' })
    }
  }

  return { success: errors.length === 0, processedLeases, invoicesCreated, invoicesSkipped, errors }
}

export async function validatePrepaymentData(
  input: ValidatePrepaymentInput
): Promise<ValidatePrepaymentResult> {
  const admin = createAdminClient()
  const errors: string[] = []
  const warnings: string[] = []

  const { data: lease, error: leaseError } = await admin
    .from('leases')
    .select('id, tenant_user_id, monthly_rent, status, start_date, end_date, rent_paid_until, next_rent_due_date')
    .eq('id', input.leaseId)
    .maybeSingle()

  if (leaseError || !lease) {
    return {
      isValid: false,
      errors: ['Lease not found.'],
      warnings,
      expectedAmount: 0,
      unpaidInvoiceCount: 0,
      coversMonths: [],
    }
  }

  const leaseRecord = lease as LeaseRecord
  ensureLeaseActive(leaseRecord, errors)

  const monthsPaid = clampMonthsPaid(input.monthsPaid)
  const monthlyRent = normalizeCurrency(leaseRecord.monthly_rent)
  const expectedAmount = validateAmount(input.amountPaid, monthsPaid, monthlyRent, errors, warnings)
  ensurePaymentRecency(input.paymentDate, errors)

  const unpaidInvoices = await fetchUnpaidInvoices(admin, input.leaseId)
  validateMonthsRequest(monthsPaid, errors, warnings, unpaidInvoices.length)

  const { count: prepaidCount } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('lease_id', input.leaseId)
    .eq('invoice_type', 'rent')
    .eq('status', true)

  const coverageStart = resolveCoverageStart(leaseRecord)
  const coversMonths = buildDueDates(coverageStart, monthsPaid, 1, leaseRecord.end_date)

  if (coversMonths.length < monthsPaid) {
    errors.push('Lease end date prevents covering all requested months.')
  }

  const lastCover = coversMonths.length ? coversMonths[coversMonths.length - 1] : null
  const projectedNext = lastCover ? addMonthsUtc(startOfMonthUtc(new Date(lastCover)), 1) : null
  const currentPrepaid = prepaidCount ?? 0
  const totalAfter = currentPrepaid + monthsPaid
  if (totalAfter > 6) {
    warnings.push(`This brings your prepaid balance to ${totalAfter} months.`)
  }
  if (totalAfter > 12) {
    warnings.push('Large prepayment (1+ year)—confirm intent.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    expectedAmount,
    unpaidInvoiceCount: unpaidInvoices.length,
    coversMonths,
    projectedNextDueDate: projectedNext ? new Date(projectedNext) : null,
    currentPrepaidMonths: currentPrepaid,
    totalPrepaidAfterPayment: totalAfter,
    cumulativeMessage: `You have ${currentPrepaid} month(s) prepaid. After this payment, you'll have ${totalAfter} month(s) prepaid${
      lastCover
        ? ` (through ${new Date(lastCover).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}).`
        : '.'
    }`,
  }
}

/**
 * Example usage:
 *
 * await processRentPrepayment({
 *   paymentId: 'f1b7…',
 *   leaseId: 'c42d…',
 *   tenantUserId: 'af21…',
 *   amountPaid: 250000,
 *   monthsPaid: 5,
 *   paymentDate: new Date('2025-11-22T10:00:00Z'),
 *   paymentMethod: 'mpesa',
 * })
 *
 * Nightly cron:
 * await autoCreateMissingInvoices()
 *
 * Jest-style pseudo tests:
 *
 * describe('processRentPrepayment', () => {
 *   it('creates invoices for missing future months and marks them paid', async () => {
 *     // seed lease + payment fixtures, then expect appliedInvoices.length === monthsPaid
 *   })
 *
 *   it('is idempotent when invoked twice with the same payment id', async () => {
 *     await processRentPrepayment(args)
 *     await expect(processRentPrepayment(args)).resolves.toMatchObject({ success: true })
 *   })
 * })
 */
