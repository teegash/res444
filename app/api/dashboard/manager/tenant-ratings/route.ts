import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext, assertRole } from '@/lib/auth/org'
import { startOfMonthUtc } from '@/lib/invoices/rentPeriods'

type PaymentRow = {
  tenant_user_id: string
  payment_date: string | null
  created_at: string | null
  invoices: {
    due_date: string | null
    invoice_type: string | null
  } | null
}

function toDateOnly(value?: string | Date | null): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function isAfterMonth(a: Date, b: Date) {
  if (a.getUTCFullYear() > b.getUTCFullYear()) return true
  if (a.getUTCFullYear() < b.getUTCFullYear()) return false
  return a.getUTCMonth() > b.getUTCMonth()
}

function isBeforeMonth(a: Date, b: Date) {
  if (a.getUTCFullYear() < b.getUTCFullYear()) return true
  if (a.getUTCFullYear() > b.getUTCFullYear()) return false
  return a.getUTCMonth() < b.getUTCMonth()
}

function scorePayment(dueDate: Date | null, paidDate: Date | null): number | null {
  if (!paidDate) return null
  const paid = toDateOnly(paidDate)
  if (!paid) return null

  const due = toDateOnly(dueDate)
  if (!due) {
    const day = paid.getUTCDate()
    if (day <= 5) return 100
    if (day <= 15) return 90
    if (day <= 25) return 80
    return 60
  }

  if (isBeforeMonth(paid, due)) return 100
  if (isAfterMonth(paid, due)) return 60

  const day = paid.getUTCDate()
  if (day <= 5) return 100
  if (day <= 15) return 90
  if (day <= 25) return 80
  return 60
}

function isPastPenaltyDate(dueDate: Date | null, today: Date): boolean {
  const due = toDateOnly(dueDate)
  if (!due) return false
  const threshold = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 25))
  const todayDate = toDateOnly(today)
  if (!todayDate) return false
  return todayDate.getTime() >= threshold.getTime()
}

function ratingBucket(rate: number | null): 'green' | 'yellow' | 'orange' | 'red' | 'none' {
  if (rate === null) return 'none'
  if (rate >= 90) return 'green'
  if (rate >= 80) return 'yellow'
  if (rate >= 70) return 'orange'
  return 'red'
}

export async function GET(req: Request) {
  try {
    const ctx = await getOrgContext()
    assertRole(ctx, ['admin', 'manager'])

    const url = new URL(req.url)
    const order = (url.searchParams.get('order') || 'desc').toLowerCase()
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Math.max(0, Number(limitRaw)) : 0

    const admin = createAdminClient()

    const { data: profiles, error: profileErr } = await admin
      .from('user_profiles')
      .select('id, full_name')
      .eq('organization_id', ctx.organizationId)
      .eq('role', 'tenant')

    if (profileErr) {
      console.warn('[TenantRatings] profiles lookup failed', profileErr)
      return NextResponse.json({ success: false, error: 'Failed to load tenants' }, { status: 500 })
    }

    const tenants = profiles || []
    if (tenants.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const tenantIds = tenants.map((t: any) => t.id).filter(Boolean)
    const nameMap = new Map<string, string>()
    tenants.forEach((p: any) => {
      if (p?.id) nameMap.set(p.id, p.full_name || 'Tenant')
    })

    const { data: leases, error: leaseErr } = await admin
      .from('leases')
      .select('id, tenant_user_id, start_date, rent_paid_until, status')
      .eq('organization_id', ctx.organizationId)
      .in('tenant_user_id', tenantIds)
      .in('status', ['active', 'pending', 'renewed'])

    if (leaseErr) {
      console.error('[TenantRatings] leases query failed', leaseErr)
      return NextResponse.json({ success: false, error: 'Failed to load leases' }, { status: 500 })
    }

    const leaseMeta = new Map<
      string,
      { tenant_user_id: string; rent_paid_until: string | null; eligible_start: string | null }
    >()

    ;(leases || []).forEach((lease: any) => {
      if (!lease?.id || !lease?.tenant_user_id) return
      const leaseStartDate = lease.start_date ? new Date(lease.start_date) : null
      const leaseStartMonth = leaseStartDate
        ? new Date(Date.UTC(leaseStartDate.getUTCFullYear(), leaseStartDate.getUTCMonth(), 1))
        : null
      const leaseEligible =
        leaseStartDate && leaseStartDate.getUTCDate() > 1 && leaseStartMonth
          ? new Date(Date.UTC(leaseStartMonth.getUTCFullYear(), leaseStartMonth.getUTCMonth() + 1, 1))
          : leaseStartMonth

      leaseMeta.set(lease.id, {
        tenant_user_id: lease.tenant_user_id,
        rent_paid_until: lease.rent_paid_until || null,
        eligible_start: leaseEligible ? leaseEligible.toISOString() : null,
      })
    })

    const leaseIds = Array.from(leaseMeta.keys())

    const tenantScores = new Map<string, { total: number; count: number; payments: number }>()
    const today = new Date()

    if (leaseIds.length > 0) {
      const { data: invoices, error: invoiceErr } = await admin
        .from('invoices')
        .select('id, lease_id, due_date, status, invoice_type')
        .in('lease_id', leaseIds)

      if (invoiceErr) {
        console.error('[TenantRatings] invoices query failed', invoiceErr)
        return NextResponse.json({ success: false, error: 'Failed to load invoices' }, { status: 500 })
      }

      ;(invoices || []).forEach((invoice: any) => {
        const meta = leaseMeta.get(invoice.lease_id)
        if (!meta) return
        if ((invoice.invoice_type || 'rent').toLowerCase() !== 'rent') return

        const rentPaidUntilDate = meta.rent_paid_until ? new Date(meta.rent_paid_until) : null
        const dueDateObj = toDateOnly(invoice.due_date)
        const eligibleStart = meta.eligible_start ? new Date(meta.eligible_start) : null

        const isCovered =
          rentPaidUntilDate !== null &&
          dueDateObj !== null &&
          !Number.isNaN(dueDateObj.getTime()) &&
          dueDateObj.getTime() <= rentPaidUntilDate.getTime()

        const isPreStart =
          eligibleStart !== null &&
          dueDateObj !== null &&
          !Number.isNaN(dueDateObj.getTime()) &&
          startOfMonthUtc(dueDateObj) < startOfMonthUtc(eligibleStart)

        const rawStatus = invoice.status
        const normalizedPaid =
          rawStatus === true ||
          rawStatus === 'paid' ||
          rawStatus === 'verified' ||
          rawStatus === 'settled'

        const statusValue =
          isCovered || isPreStart || normalizedPaid ? true : rawStatus === false ? false : false

        if (!statusValue && isPastPenaltyDate(dueDateObj, today)) {
          const current = tenantScores.get(meta.tenant_user_id) || { total: 0, count: 0, payments: 0 }
          tenantScores.set(meta.tenant_user_id, {
            total: current.total + 60,
            count: current.count + 1,
            payments: current.payments,
          })
        }
      })
    }

    const { data: payments, error } = await admin
      .from('payments')
      .select(
        `
        tenant_user_id,
        payment_date,
        created_at,
        invoices (
          created_at,
          due_date,
          invoice_type
        )
      `
      )
      .eq('verified', true)
      .eq('organization_id', ctx.organizationId)
      .not('tenant_user_id', 'is', null)
      .in('tenant_user_id', tenantIds)
      .eq('invoices.invoice_type', 'rent')

    if (error) {
      console.error('[TenantRatings] payments query failed', error)
      return NextResponse.json({ success: false, error: 'Failed to load payments' }, { status: 500 })
    }

    ;(payments || []).forEach((row: any) => {
      const p = row as PaymentRow
      const tenantId = p.tenant_user_id
      if (!tenantId) return

      const paidDate = p.payment_date
        ? new Date(p.payment_date)
        : p.created_at
          ? new Date(p.created_at)
          : null

      const dueDate = toDateOnly(p.invoices?.due_date || null)
      const score = scorePayment(dueDate, paidDate)
      if (score === null) return

      const current = tenantScores.get(tenantId) || { total: 0, count: 0, payments: 0 }
      tenantScores.set(tenantId, {
        total: current.total + score,
        count: current.count + 1,
        payments: current.payments + 1,
      })
    })

    let ratings = tenantIds.map((tenantId) => {
      const s = tenantScores.get(tenantId) || { total: 0, count: 0, payments: 0 }
      const rate = s.count > 0 ? Math.round(s.total / s.count) : null
      return {
        tenant_id: tenantId,
        name: nameMap.get(tenantId) || 'Tenant',
        on_time_rate: rate,
        payments: s.payments,
        bucket: ratingBucket(rate),
      }
    })

    ratings.sort((a, b) => {
      if (order === 'asc') {
        const aRate = a.on_time_rate ?? Number.POSITIVE_INFINITY
        const bRate = b.on_time_rate ?? Number.POSITIVE_INFINITY
        return aRate - bRate || b.payments - a.payments
      }
      const aRate = a.on_time_rate ?? Number.NEGATIVE_INFINITY
      const bRate = b.on_time_rate ?? Number.NEGATIVE_INFINITY
      return bRate - aRate || b.payments - a.payments
    })

    if (limit > 0) ratings = ratings.slice(0, limit)

    return NextResponse.json({ success: true, data: ratings })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthenticated' ? 401 : msg === 'Forbidden' ? 403 : 500
    console.error('[TenantRatings] failed', err)
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
