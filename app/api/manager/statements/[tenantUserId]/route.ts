import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildStatementPayloadFromRpc } from '@/lib/statements/statementPayload'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>
type ManagerContextResult = { admin: AdminClient; orgId: string } | { error: NextResponse }

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

    let resolvedLeaseId: string | null = leaseId
    let lease: any | null = null

    const leaseQuery = admin
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

    if (resolvedLeaseId) {
      const { data: leaseRow, error: leaseError } = await leaseQuery.eq('id', resolvedLeaseId).maybeSingle()
      if (leaseError) throw leaseError
      lease = leaseRow
      if (!lease) {
        return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 })
      }
    } else {
      const { data: leaseRow, error: leaseError } = await leaseQuery
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (leaseError) throw leaseError
      lease = leaseRow
      resolvedLeaseId = lease?.id || null
    }

    const { data, error } = await admin.rpc('get_tenant_statement', {
      p_organization_id: orgId,
      p_tenant_user_id: tenantUserId,
      p_lease_id: resolvedLeaseId,
    })

    if (error) {
      console.error('[ManagerStatement] RPC get_tenant_statement failed', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const { payload, rawRows } = buildStatementPayloadFromRpc({
      tenantProfile: tenantProfile as any,
      lease: lease as any,
      rpcData: data,
    })

    return NextResponse.json({ success: true, data: payload, rows: rawRows })
  } catch (error) {
    console.error('[ManagerStatement] Failed to load tenant statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant statement.' },
      { status: 500 }
    )
  }
}
