import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext, assertRole } from '@/lib/auth/org'

type PaymentRow = {
  tenant_user_id: string
  payment_date: string | null
  created_at: string | null
  months_paid: number | null
  invoices: {
    created_at: string | null
    invoice_type: string | null
  } | null
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function scorePayment(invoiceCreated: Date | null, paid: Date | null): number {
  if (!paid) return 0

  if (invoiceCreated) {
    const diffDays = daysBetween(invoiceCreated, paid)
    if (diffDays > 30) return 60
  }

  const day = paid.getDate()
  if (day <= 5) return 100
  if (day <= 15) return 90
  return 80
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

    const { data: payments, error } = await admin
      .from('payments')
      .select(
        `
        tenant_user_id,
        payment_date,
        created_at,
        months_paid,
        invoices!inner (
          created_at,
          invoice_type
        )
      `
      )
      .eq('verified', true)
      .eq('organization_id', ctx.organizationId)
      .not('tenant_user_id', 'is', null)
      .eq('invoices.invoice_type', 'rent')

    if (error) {
      console.error('[TenantRatings] payments query failed', error)
      return NextResponse.json({ success: false, error: 'Failed to load payments' }, { status: 500 })
    }

    const stats = new Map<string, { weight: number; score: number }>()

    ;(payments || []).forEach((row: any) => {
      const p = row as PaymentRow
      const tenantId = p.tenant_user_id
      if (!tenantId) return

      const paidDate = p.payment_date
        ? new Date(p.payment_date)
        : p.created_at
          ? new Date(p.created_at)
          : null

      const invoiceCreated = p.invoices?.created_at ? new Date(p.invoices.created_at) : null
      const score = scorePayment(invoiceCreated, paidDate)
      const weight = Math.max(1, Number(p.months_paid || 1))

      const current = stats.get(tenantId) || { weight: 0, score: 0 }
      stats.set(tenantId, {
        weight: current.weight + weight,
        score: current.score + score * weight,
      })
    })

    const tenantIds = Array.from(stats.keys())
    const nameMap = new Map<string, string>()

    if (tenantIds.length > 0) {
      const { data: profiles, error: profileErr } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .eq('organization_id', ctx.organizationId)
        .in('id', tenantIds)

      if (profileErr) {
        console.warn('[TenantRatings] profiles lookup failed', profileErr)
      } else {
        ;(profiles || []).forEach((p: any) => {
          nameMap.set(p.id, p.full_name || 'Tenant')
        })
      }
    }

    let ratings = tenantIds.map((tenantId) => {
      const s = stats.get(tenantId)!
      const rate = s.weight > 0 ? Math.round(s.score / s.weight) : 0
      return {
        tenant_id: tenantId,
        name: nameMap.get(tenantId) || 'Tenant',
        on_time_rate: rate,
        payments: s.weight,
        bucket: ratingBucket(rate),
      }
    })

    ratings.sort((a, b) => {
      if (order === 'asc') return a.on_time_rate - b.on_time_rate || b.payments - a.payments
      return b.on_time_rate - a.on_time_rate || b.payments - a.payments
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
