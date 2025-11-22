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

interface LeaseRecord {
  id: string
  tenant_user_id: string
  monthly_rent: number | string
  status: string
  start_date: string
  end_date: string | null
  rent_paid_until?: string | null
  rent_due_day?: number | null
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
}

export interface AutoCreateMissingInvoicesOptions {
  leaseIds?: string[]
  forceRecreate?: boolean
}

export interface AutoCreateMissingInvoicesResult {
  success: boolean
  processedLeases: number
  invoicesCreated: number
  errors: Array<{ leaseId: string; error: string }>
}

export interface NextDueDateResult {
  nextDueDate: Date | null
  nextAmount: number | null
  unpaidCount: number
  totalOwed: number
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

const normalizeCurrency = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return 0
}

const clampMonthsPaid = (months: number): number => Math.max(1, Math.floor(months))

const deriveDueDay = (lease: LeaseRecord, reference?: InvoiceRecord | null) => {
  if (lease.rent_due_day && lease.rent_due_day > 0 && lease.rent_due_day <= 28) {
    return lease.rent_due_day
  }
  const refDate = reference?.due_date ? parseDate(reference.due_date) : null
  if (refDate) {
    return refDate.getUTCDate()
  }
  return 1
}

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

const resolveCoverageStart = (
  lease: LeaseRecord,
  oldestUnpaid: InvoiceRecord | null,
  latestInvoice: InvoiceRecord | null
): Date => {
  const leaseStart = lease.start_date ? startOfMonthUtc(new Date(lease.start_date)) : startOfMonthUtc(todayUtc())
  if (oldestUnpaid?.due_date) {
    const due = parseDate(oldestUnpaid.due_date)
    if (due) {
      const start = startOfMonthUtc(due)
      return start < leaseStart ? leaseStart : start
    }
  }

  if (lease.rent_paid_until) {
    const paid = parseDate(lease.rent_paid_until)
    if (paid) {
      const next = addMonthsUtc(startOfMonthUtc(paid), 1)
      return next < leaseStart ? leaseStart : next
    }
  }

  if (latestInvoice?.due_date) {
    const last = parseDate(latestInvoice.due_date)
    if (last) {
      const next = addMonthsUtc(startOfMonthUtc(last), 1)
      return next < leaseStart ? leaseStart : next
    }
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
    .in('status', Array.from(UNPAID_STATUSES))
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
    .in('status', Array.from(UNPAID_STATUSES))
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
  const { data } = await admin
    .from('invoices')
    .select('id, due_date, amount, status')
    .eq('lease_id', leaseId)
    .eq('invoice_type', 'rent')
    .in('status', Array.from(UNPAID_STATUSES))
    .order('due_date', { ascending: true })

  const invoices = data ?? []

  if (!invoices.length) {
    return { nextDueDate: null, nextAmount: null, unpaidCount: 0, totalOwed: 0 }
  }

  const nextInvoice = invoices[0]
  const nextDue = parseDate(nextInvoice.due_date)
  const nextDueDate = nextDue ? new Date(nextDue.getTime()) : null
  const nextAmount = normalizeCurrency(nextInvoice.amount)
  const totalOwed = invoices.reduce((total, row) => total + normalizeCurrency(row.amount), 0)

  return {
    nextDueDate,
    nextAmount,
    unpaidCount: invoices.length,
    totalOwed,
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
    const [{ data: lease, error: leaseError }, { data: payment, error: paymentError }] = await Promise.all([
      admin
        .from('leases')
        .select(
          'id, tenant_user_id, monthly_rent, status, start_date, end_date, rent_paid_until, rent_due_day'
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
    const monthsPaid = clampMonthsPaid(input.monthsPaid)
    const amountPaid = input.amountPaid
    const paymentDate = input.paymentDate

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
      }
    }

    const [oldestUnpaid, latestInvoice] = await Promise.all([
      fetchOldestUnpaidInvoice(admin, input.leaseId),
      fetchLatestInvoice(admin, input.leaseId),
    ])

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

    const dueDay = deriveDueDay(leaseRecord, oldestUnpaid ?? latestInvoice ?? unpaidInvoices[0] ?? null)
    const coverageStart = resolveCoverageStart(leaseRecord, oldestUnpaid, latestInvoice)
    const coverageDueDates = buildDueDates(coverageStart, monthsPaid, dueDay, leaseRecord.end_date)

    if (coverageDueDates.length < monthsPaid) {
      validationErrors.push('Lease end date prevents covering all requested months.')
      return {
        success: false,
        message: 'Lease ends before all prepaid months can be applied.',
        validationErrors,
        appliedInvoices: [],
        createdInvoices: [],
        nextDueDate: null,
        nextDueAmount: null,
      }
    }

    const rangeInvoices = await fetchInvoicesForRange(
      admin,
      input.leaseId,
      coverageDueDates[0],
      coverageDueDates[coverageDueDates.length - 1]
    )

    const invoiceByMonth = new Map<string, InvoiceRecord>()
    const invoiceById = new Map<string, InvoiceRecord>()
    rangeInvoices.forEach((invoice) => {
      const normalized = invoice as InvoiceRecord
      invoiceByMonth.set(monthKey(invoice.due_date), normalized)
      invoiceById.set(normalized.id, normalized)
    })

    const appliedInvoices: string[] = []
    const createdInvoices: string[] = []

    for (const dueDateIso of coverageDueDates) {
      const key = monthKey(dueDateIso)
      let invoice = invoiceByMonth.get(key)
      if (!invoice) {
        const { data: created, error } = await admin
          .from('invoices')
          .insert({
            lease_id: input.leaseId,
            invoice_type: 'rent',
            amount: monthlyRent,
            due_date: dueDateIso,
            status: 'unpaid',
            months_covered: 1,
          })
          .select('id, lease_id, due_date, amount, status')
          .single()

        if (error || !created) {
          throw error || new Error('Failed to create rent invoice.')
        }

        invoice = created as InvoiceRecord
        invoiceByMonth.set(key, invoice)
        invoiceById.set(invoice.id, invoice)
        createdInvoices.push(invoice.id)
      }
      appliedInvoices.push(invoice.id)
    }

    const invoicesToUpdate = appliedInvoices.filter((invoiceId) => {
      const invoice = invoiceById.get(invoiceId)
      return invoice ? !invoiceStatusToBoolean(invoice.status) : true
    })

    if (invoicesToUpdate.length) {
      const paymentDateIso = toDateOnlyIso(paymentDate)
      const nowIso = new Date().toISOString()
      const { error: updateError } = await admin
        .from('invoices')
        .update({ status: 'paid', payment_date: paymentDateIso, updated_at: nowIso })
        .in('id', invoicesToUpdate)

      if (updateError) {
        throw updateError
      }
    }

    const { error: paymentUpdateError } = await admin
      .from('payments')
      .update({ invoice_id: appliedInvoices[0], months_paid: monthsPaid })
      .eq('id', input.paymentId)

    if (paymentUpdateError) {
      throw paymentUpdateError
    }

    const rentPaidUntil = calculatePaidUntil(
      leaseRecord.rent_paid_until || null,
      coverageDueDates[0],
      monthsPaid
    )

    if (rentPaidUntil) {
      await admin
        .from('leases')
        .update({ rent_paid_until: rentPaidUntil })
        .eq('id', input.leaseId)
    }

    if (!paymentRecord.notes?.includes(PREPAYMENT_FLAG)) {
      const updatedNotes = paymentRecord.notes
        ? `${paymentRecord.notes}\n${PREPAYMENT_FLAG}`
        : PREPAYMENT_FLAG
      await admin
        .from('payments')
        .update({ notes: updatedNotes })
        .eq('id', input.paymentId)
    }

    const nextDue = await computeNextDueDateInternal(admin, input.leaseId)

    return {
      success: true,
      message: warnings.length ? `Processed with warnings: ${warnings.join(' ')}` : 'Rent prepayment applied.',
      validationErrors: [],
      appliedInvoices,
      createdInvoices,
      nextDueDate: nextDue.nextDueDate,
      nextDueAmount: nextDue.nextAmount,
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

  const query = admin
    .from('leases')
    .select('id, tenant_user_id, monthly_rent, status, start_date, end_date, rent_paid_until, rent_due_day')
    .eq('status', 'active')

  if (options.leaseIds?.length) {
    query.in('id', options.leaseIds)
  }

  const { data: leases, error } = await query
  if (error) {
    return { success: false, processedLeases: 0, invoicesCreated: 0, errors: [{ leaseId: 'all', error: error.message }] }
  }

  for (const leaseRow of leases ?? []) {
    processedLeases += 1
    const lease = leaseRow as LeaseRecord
    const monthlyRent = normalizeCurrency(lease.monthly_rent)

    try {
      const latestInvoice = await fetchLatestInvoice(admin, lease.id)
      const dueDay = deriveDueDay(lease, latestInvoice)
      let cursor = latestInvoice?.due_date
        ? addMonthsUtc(startOfMonthUtc(new Date(latestInvoice.due_date)), 1)
        : startOfMonthUtc(new Date(lease.start_date))

      const upperBound = startOfMonthUtc(todayUtc())
      const endCap = lease.end_date ? startOfMonthUtc(new Date(lease.end_date)) : null
      const dueDates: string[] = []

      while (cursor <= upperBound && (!endCap || cursor <= endCap)) {
        const due = new Date(cursor)
        const monthEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0))
        const clampDay = Math.min(dueDay, monthEnd.getUTCDate())
        due.setUTCDate(clampDay)
        dueDates.push(toIsoDate(due))
        cursor = addMonthsUtc(cursor, 1)
      }

      if (!dueDates.length) {
        continue
      }

      const existing = await fetchInvoicesForRange(admin, lease.id, dueDates[0], dueDates[dueDates.length - 1])
      const existingKeys = new Set(existing.map((row) => monthKey(row.due_date)))

      const payload = dueDates
        .filter((dateIso) => options.forceRecreate || !existingKeys.has(monthKey(dateIso)))
        .map((dueDateIso) => ({
          lease_id: lease.id,
          invoice_type: 'rent',
          amount: monthlyRent,
          due_date: dueDateIso,
          status: 'unpaid',
          months_covered: 1,
        }))

      if (!payload.length) {
        continue
      }

      const { data: inserted, error: insertError } = await admin
        .from('invoices')
        .upsert(payload, { onConflict: 'lease_id,invoice_type,due_date' })
        .select('id')

      if (insertError) {
        throw insertError
      }

      invoicesCreated += inserted?.length ?? 0
    } catch (leaseError) {
      errors.push({ leaseId: lease.id, error: leaseError instanceof Error ? leaseError.message : 'Failed to create invoices.' })
    }
  }

  return { success: errors.length === 0, processedLeases, invoicesCreated, errors }
}

export async function validatePrepaymentData(
  input: ValidatePrepaymentInput
): Promise<ValidatePrepaymentResult> {
  const admin = createAdminClient()
  const errors: string[] = []
  const warnings: string[] = []

  const { data: lease, error: leaseError } = await admin
    .from('leases')
    .select('id, tenant_user_id, monthly_rent, status, start_date, end_date, rent_paid_until, rent_due_day')
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

  const [oldestUnpaid, latestInvoice] = await Promise.all([
    fetchOldestUnpaidInvoice(admin, input.leaseId),
    fetchLatestInvoice(admin, input.leaseId),
  ])

  const dueDay = deriveDueDay(leaseRecord, oldestUnpaid ?? latestInvoice ?? unpaidInvoices[0] ?? null)
  const coverageStart = resolveCoverageStart(leaseRecord, oldestUnpaid, latestInvoice)
  const coversMonths = buildDueDates(coverageStart, monthsPaid, dueDay, leaseRecord.end_date)

  if (coversMonths.length < monthsPaid) {
    errors.push('Lease end date prevents covering all requested months.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    expectedAmount,
    unpaidInvoiceCount: unpaidInvoices.length,
    coversMonths,
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
