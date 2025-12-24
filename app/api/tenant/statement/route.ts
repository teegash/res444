import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    const leaseId =
      request.nextUrl.searchParams.get('leaseId') || request.nextUrl.searchParams.get('lease_id') || null

    const { data, error } = await admin.rpc('get_tenant_statement', {
      p_organization_id: orgId,
      p_tenant_user_id: user.id,
      p_lease_id: leaseId,
    })

    if (error) {
      console.error('[TenantStatement] RPC get_tenant_statement failed', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data ?? [], rows: Array.isArray(data) ? data : [] })
  } catch (error) {
    console.error('[TenantStatement] Failed to load tenant statement', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant statement.' },
      { status: 500 }
    )
  }
}

