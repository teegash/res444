import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext, assertRole } from '@/lib/auth/org'

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

    const { data: leaseRows, error: leaseErr } = await admin
      .from('leases')
      .select('tenant_user_id, unit_id, status')
      .eq('organization_id', ctx.organizationId)
      .not('tenant_user_id', 'is', null)
      .not('unit_id', 'is', null)
      .in('status', ['active', 'pending', 'renewed', 'valid'])

    if (leaseErr) {
      console.warn('[TenantRatings] leases lookup failed', leaseErr)
      return NextResponse.json({ success: false, error: 'Failed to load tenant leases' }, { status: 500 })
    }

    const assignedTenantIds = new Set(
      (leaseRows || []).map((row: any) => row.tenant_user_id).filter(Boolean)
    )

    const tenantIds = tenants
      .map((t: any) => t.id)
      .filter((id: string) => id && assignedTenantIds.has(id))

    if (tenantIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }
    const nameMap = new Map<string, string>()
    tenants.forEach((p: any) => {
      if (p?.id) nameMap.set(p.id, p.full_name || 'Tenant')
    })

    const { data: ratingsRows, error: ratingErr } = await admin
      .from('vw_tenant_payment_timeliness')
      .select('tenant_user_id, rating_percentage, scored_items_count')
      .eq('organization_id', ctx.organizationId)

    if (ratingErr) {
      console.error('[TenantRatings] view query failed', ratingErr)
      return NextResponse.json({ success: false, error: 'Failed to load tenant ratings' }, { status: 500 })
    }

    const ratingsMap = new Map<string, { rate: number | null; count: number }>()
    ;(ratingsRows || []).forEach((row: any) => {
      ratingsMap.set(row.tenant_user_id, {
        rate: row.rating_percentage === null ? null : Number(row.rating_percentage),
        count: Number(row.scored_items_count || 0),
      })
    })

    let ratings = tenantIds.map((tenantId) => {
      const entry = ratingsMap.get(tenantId)
      const rate = entry?.rate ?? null
      return {
        tenant_id: tenantId,
        name: nameMap.get(tenantId) || 'Tenant',
        on_time_rate: rate,
        payments: entry?.count ?? 0,
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
