import { NextRequest, NextResponse } from 'next/server'
import { getManagerContext } from '@/lib/lease-renewals/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) return ctx.error

    const { admin, orgId } = ctx
    const status = request.nextUrl.searchParams.get('status')?.trim() || null

    let query = admin
      .from('lease_renewals')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status)

    const { data: renewals, error: renewErr } = await query
    if (renewErr) throw renewErr

    const rows = (renewals || []) as any[]
    const leaseIds = Array.from(new Set(rows.map((r) => r.lease_id).filter(Boolean)))
    const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_user_id).filter(Boolean)))

    const { data: leases, error: leaseErr } = leaseIds.length
      ? await admin
          .from('leases')
          .select(
            `
            id,
            tenant_user_id,
            start_date,
            end_date,
            status,
            unit:apartment_units (
              unit_number,
              building:apartment_buildings (
                name,
                location
              )
            )
          `
          )
          .eq('organization_id', orgId)
          .in('id', leaseIds)
      : { data: [], error: null }

    if (leaseErr) {
      console.warn('[ManagerLeaseRenewals] Failed to load leases for renewals', leaseErr)
    }

    const { data: tenants, error: tenantErr } = tenantIds.length
      ? await admin
          .from('user_profiles')
          .select('id, full_name, phone_number')
          .eq('organization_id', orgId)
          .in('id', tenantIds)
      : { data: [], error: null }

    if (tenantErr) {
      console.warn('[ManagerLeaseRenewals] Failed to load tenant profiles for renewals', tenantErr)
    }

    const leaseMap = new Map<string, any>((leases || []).map((l: any) => [l.id, l]))
    const tenantMap = new Map<string, any>((tenants || []).map((t: any) => [t.id, t]))

    const enriched = rows.map((r) => {
      const lease = leaseMap.get(r.lease_id) || null
      const tenant = tenantMap.get(r.tenant_user_id) || null
      return {
        ...r,
        tenant_name: tenant?.full_name || null,
        tenant_phone: tenant?.phone_number || null,
        property_name: lease?.unit?.building?.name || null,
        property_location: lease?.unit?.building?.location || null,
        unit_number: lease?.unit?.unit_number || null,
        lease_status: lease?.status || null,
      }
    })

    return NextResponse.json({ success: true, data: enriched })
  } catch (error) {
    console.error('[ManagerLeaseRenewals] Failed to load renewals', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load renewals.' },
      { status: 500 }
    )
  }
}

