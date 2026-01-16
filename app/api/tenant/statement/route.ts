import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildStatementPayloadFromRpc } from '@/lib/statements/statementPayload'

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

async function resolveTenantOrgId(admin: AdminClient, userId: string) {
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (membership?.organization_id) {
    return membership.organization_id
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  return profile?.organization_id || null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      )
    }

    const orgId = await resolveTenantOrgId(admin, user.id)
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const requestedLeaseId =
      request.nextUrl.searchParams.get('leaseId') || request.nextUrl.searchParams.get('lease_id') || null

    const { data: tenantProfile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url')
      .eq('id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }
    if (!tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant profile not found.' }, { status: 404 })
    }

    let leaseId: string | null = requestedLeaseId
    let lease: any | null = null

    // Default to the latest active/pending lease if no leaseId is provided.
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
      .eq('tenant_user_id', user.id)
      .eq('organization_id', orgId)
      .in('status', ['active', 'pending', 'renewed'])
      .order('start_date', { ascending: false })
      .limit(1)

    if (leaseId) {
      const { data: leaseRow, error: leaseError } = await leaseQuery.eq('id', leaseId).maybeSingle()
      if (leaseError) throw leaseError
      lease = leaseRow
      if (!lease) {
        return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 })
      }
    } else {
      const { data: leaseRow, error: leaseError } = await leaseQuery.maybeSingle()
      if (leaseError) throw leaseError
      lease = leaseRow
      leaseId = lease?.id || null
    }

    const { data, error } = await admin.rpc('get_tenant_statement', {
      p_organization_id: orgId,
      p_tenant_user_id: user.id,
      p_lease_id: leaseId,
    })

    if (error) {
      console.error('[TenantStatement] RPC get_tenant_statement failed', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const { payload, rawRows } = buildStatementPayloadFromRpc({
      tenantProfile: tenantProfile as any,
      lease: lease as any,
      rpcData: data,
    })

    return NextResponse.json({ success: true, data: payload, rows: rawRows })
  } catch (error) {
    console.error('[TenantStatement] Failed to load tenant statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant statement.' },
      { status: 500 }
    )
  }
}
