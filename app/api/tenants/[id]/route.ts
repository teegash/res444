import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

interface RouteParams {
  params: {
    id: string
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const payload = await request.json().catch(() => ({}))
  const {
    full_name,
    phone_number,
    national_id,
    address,
    date_of_birth,
    tenant_user_id,
  }: Record<string, string | null | undefined> = payload || {}

  const tenantId = params?.id || tenant_user_id

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    if (
      !full_name &&
      !phone_number &&
      !national_id &&
      typeof address === 'undefined' &&
      typeof date_of_birth === 'undefined'
    ) {
      return NextResponse.json(
        { success: false, error: 'No editable fields were provided.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()

    const profileUpdate: Record<string, string | null | undefined> = {}
    if (full_name !== undefined) profileUpdate.full_name = full_name
    if (phone_number !== undefined) profileUpdate.phone_number = phone_number
    if (national_id !== undefined) profileUpdate.national_id = national_id
    if (address !== undefined) profileUpdate.address = address ?? null
    if (date_of_birth !== undefined) profileUpdate.date_of_birth = date_of_birth || null

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminSupabase
        .from('user_profiles')
        .update(profileUpdate)
        .eq('id', tenantId)

      if (profileError) {
        throw profileError
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tenants.PUT] Failed to update tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update tenant.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Accept id from route, query, body, or path parsing (defensive)
  let tenantId =
    params?.id ||
    request.nextUrl.searchParams.get('tenantId') ||
    request.nextUrl.searchParams.get('id') ||
    request.nextUrl.searchParams.get('tenant_user_id') ||
    request.headers.get('x-tenant-id') ||
    null

  if (!tenantId) {
    // Try to parse from pathname (last segment)
    const segments = request.nextUrl.pathname.split('/').filter(Boolean)
    tenantId = segments[segments.length - 1] || null
  }

  if (!tenantId) {
    try {
      const body = await request.json().catch(() => null)
      tenantId = body?.tenant_id || body?.tenant_user_id || body?.id || null
    } catch {
      // ignore body parsing errors
    }
  }

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    // Ensure caller is manager/admin/caretaker based on membership (more reliable than metadata)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    // Check membership/role with service role to avoid RLS issues
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole =
      membership?.role ||
      (user.user_metadata as any)?.role ||
      (user as any)?.role ||
      null

    if (membershipError) {
      console.warn('[Tenants.DELETE] Failed to read membership for caller:', membershipError.message)
    }

    if (!callerRole || !MANAGER_ROLES.has(String(callerRole).toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Validate tenant record exists and is a tenant (user_profiles role)
    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select('id, role')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      console.warn('[Tenants.DELETE] Failed to read tenant profile:', tenantProfileError.message)
    }

    if (!tenantProfile || tenantProfile.role !== 'tenant') {
      return NextResponse.json(
        { success: false, error: 'Tenant not found or not a tenant role.' },
        { status: 404 }
      )
    }

    // Fetch leases up-front (used for dependent deletes and unit vacate)
    const leaseIds: string[] = []
    const unitIds: string[] = []
    const { data: leases } = await adminSupabase
      .from('leases')
      .select('id, unit_id')
      .eq('tenant_user_id', tenantId)
    leases?.forEach((row) => {
      if (row.id) leaseIds.push(row.id)
      if ((row as any).unit_id) unitIds.push((row as any).unit_id)
    })

    // Best-effort cleanup of dependent data before deleting the auth user
    const cleanupTasks = [
      adminSupabase.from('communications').delete().or(`sender_user_id.eq.${tenantId},recipient_user_id.eq.${tenantId}`),
      adminSupabase.from('payments').delete().eq('tenant_user_id', tenantId),
      adminSupabase.from('maintenance_requests').delete().eq('tenant_user_id', tenantId),
      adminSupabase.from('organization_members').delete().eq('user_id', tenantId),
      adminSupabase.from('user_profiles').delete().eq('id', tenantId),
    ]

    if (leaseIds.length) {
      cleanupTasks.push(adminSupabase.from('invoices').delete().in('lease_id', leaseIds))
      cleanupTasks.push(adminSupabase.from('leases').delete().in('id', leaseIds))
    } else {
      cleanupTasks.push(adminSupabase.from('leases').delete().eq('tenant_user_id', tenantId))
    }

    await Promise.allSettled(cleanupTasks)

    // Vacate units that were occupied by this tenant
    if (unitIds.length) {
      await adminSupabase
        .from('apartment_units')
        .update({ status: 'vacant' })
        .in('id', unitIds)
    }

    // Finally, remove the auth user (cascades to tables with FK ON DELETE CASCADE)
    const { error } = await adminSupabase.auth.admin.deleteUser(tenantId)
    if (error && error.status !== 404) {
      // Log but do not block overall cleanup; return success to avoid leaving dangling data
      console.warn('[Tenants.DELETE] Auth delete warning:', error.message || error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tenants.DELETE] Failed to delete tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete tenant.' },
      { status: 500 }
    )
  }
}
