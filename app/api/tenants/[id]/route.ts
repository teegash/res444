import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendVacancyAlert } from '@/lib/communications/vacancyAlerts'

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
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

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
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole = membership?.role ? String(membership.role).toLowerCase() : null

    if (!membership?.organization_id || !callerRole || !MANAGER_ROLES.has(callerRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select('id, organization_id, role')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      throw tenantProfileError
    }

    if (!tenantProfile || tenantProfile.organization_id !== membership.organization_id || tenantProfile.role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Tenant not found in your organization.' }, { status: 404 })
    }

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
        .eq('organization_id', membership.organization_id)

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
      .select('role, organization_id')
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
      .select('id, role, organization_id')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      console.warn('[Tenants.DELETE] Failed to read tenant profile:', tenantProfileError.message)
    }

    if (
      !tenantProfile ||
      tenantProfile.role !== 'tenant' ||
      tenantProfile.organization_id !== membership?.organization_id
    ) {
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
      .eq('organization_id', membership?.organization_id || '')
    leases?.forEach((row) => {
      if (row.id) leaseIds.push(row.id)
      if ((row as any).unit_id) unitIds.push((row as any).unit_id)
    })

    const { data: renewalRows } = await adminSupabase
      .from('lease_renewals')
      .select('id, lease_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const renewalIds = (renewalRows || []).map((row: any) => row.id).filter(Boolean)
    const renewalPaths = (renewalRows || [])
      .flatMap((row: any) => [row.pdf_unsigned_path, row.pdf_tenant_signed_path, row.pdf_fully_signed_path])
      .filter(Boolean) as string[]

    if (renewalIds.length) {
      const { error: renewalEventsError } = await adminSupabase
        .from('lease_renewal_events')
        .delete()
        .in('renewal_id', renewalIds)
      if (renewalEventsError) throw renewalEventsError
    }

    if (renewalPaths.length) {
      const { error: storageError } = await adminSupabase.storage
        .from('lease-renewals')
        .remove(renewalPaths)
      if (storageError) {
        console.warn('[Tenants.DELETE] Failed to remove renewal PDFs from storage:', storageError.message)
      }
    }

    if (renewalIds.length) {
      const { error: renewalsError } = await adminSupabase
        .from('lease_renewals')
        .delete()
        .in('id', renewalIds)
      if (renewalsError) throw renewalsError
    }

    if (leaseIds.length) {
      const { error: reminderError } = await adminSupabase
        .from('reminders')
        .delete()
        .eq('reminder_type', 'lease_renewal')
        .eq('related_entity_type', 'lease')
        .in('related_entity_id', leaseIds)
      if (reminderError) throw reminderError
    }

    // Hard-delete dependent financial data first to remove revenue traces
    const { error: paymentsError } = await adminSupabase
      .from('payments')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
    if (paymentsError) throw paymentsError

    if (leaseIds.length) {
      const { error: invoiceError } = await adminSupabase
        .from('invoices')
        .delete()
        .in('lease_id', leaseIds)
      if (invoiceError) throw invoiceError
    }

    if (leaseIds.length) {
      const { error: leaseDeleteError } = await adminSupabase
        .from('leases')
        .delete()
        .in('id', leaseIds)
        .eq('organization_id', membership?.organization_id || '')
      if (leaseDeleteError) throw leaseDeleteError
    } else {
      const { error: leaseDeleteError } = await adminSupabase
        .from('leases')
        .delete()
        .eq('tenant_user_id', tenantId)
        .eq('organization_id', membership?.organization_id || '')
      if (leaseDeleteError) throw leaseDeleteError
    }

    // Communications, maintenance, org membership, profile
    const { error: commsError } = await adminSupabase
      .from('communications')
      .delete()
      .or(`sender_user_id.eq.${tenantId},recipient_user_id.eq.${tenantId}`)
      .eq('organization_id', membership?.organization_id || '')
    if (commsError) throw commsError

    const { error: maintError } = await adminSupabase
      .from('maintenance_requests')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
    if (maintError) throw maintError

    const { error: orgError } = await adminSupabase.from('organization_members').delete().eq('user_id', tenantId)
    if (orgError) throw orgError

    const { error: profileError } = await adminSupabase.from('user_profiles').delete().eq('id', tenantId)
    if (profileError) throw profileError

    let unitsToAlert: Array<{
      id: string
      unit_number: string | null
      status: string | null
      building: { id: string; name: string | null; vacancy_alerts_enabled: boolean | null } | null
    }> = []

    // Vacate units that were occupied by this tenant
    if (unitIds.length) {
      const { data: unitRows } = await adminSupabase
        .from('apartment_units')
        .select(
          `
          id,
          unit_number,
          status,
          building:apartment_buildings (
            id,
            name,
            vacancy_alerts_enabled
          )
        `
        )
        .in('id', unitIds)
        .eq('organization_id', membership?.organization_id || '')

      unitsToAlert = (unitRows || []) as any[]

      const { error: unitError } = await adminSupabase
        .from('apartment_units')
        .update({ status: 'vacant' })
        .in('id', unitIds)
      if (unitError) throw unitError
    }

    // Finally, remove the auth user (cascades to tables with FK ON DELETE CASCADE)
    const { error } = await adminSupabase.auth.admin.deleteUser(tenantId)
    if (error && error.status !== 404) {
      // Log but do not block overall cleanup; return success to avoid leaving dangling data
      console.warn('[Tenants.DELETE] Auth delete warning:', error.message || error)
    }

    for (const unit of unitsToAlert) {
      if (!unit?.building?.vacancy_alerts_enabled || !unit?.building?.id) continue
      const priorStatus = String(unit.status || '').toLowerCase()
      if (priorStatus !== 'occupied') continue
      await sendVacancyAlert({
        adminSupabase,
        organizationId: membership?.organization_id || '',
        buildingId: unit.building.id,
        buildingName: unit.building.name || undefined,
        unitNumber: unit.unit_number,
        actorUserId: user?.id || null,
      })
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
