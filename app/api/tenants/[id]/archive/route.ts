import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const MANAGER_ROLES = new Set(['admin', 'manager'])

function resolveTenantId(req: NextRequest, params?: { id?: string }) {
  let tenantId =
    params?.id ||
    req.nextUrl.searchParams.get('tenantId') ||
    req.nextUrl.searchParams.get('id') ||
    null

  if (!tenantId) {
    const segments = req.nextUrl.pathname.split('/').filter(Boolean)
    const tenantsIndex = segments.indexOf('tenants')
    if (tenantsIndex >= 0 && segments[tenantsIndex + 1]) {
      tenantId = segments[tenantsIndex + 1]
    } else if (segments.length >= 2 && segments[segments.length - 1] === 'archive') {
      tenantId = segments[segments.length - 2]
    }
  }

  return String(tenantId || '').trim()
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = resolveTenantId(req, params)
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null

    const admin = createAdminClient()

    const { data: membership, error: memErr } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const orgId = membership?.organization_id || null
    const role = membership?.role ? String(membership.role).toLowerCase() : null

    if (memErr || !orgId || !role || !MANAGER_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: profile } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, national_id, address, date_of_birth, organization_id, role')
      .eq('organization_id', orgId)
      .eq('id', tenantId)
      .maybeSingle()

    if (!profile || profile.role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Tenant not found.' }, { status: 404 })
    }

    const { data: activeLease } = await admin
      .from('leases')
      .select('id, unit_id, start_date, end_date, monthly_rent, deposit_amount, status')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .in('status', ['active', 'pending', 'renewed'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    let unitSnapshot: any = null
    if (activeLease?.unit_id) {
      const { data: unit } = await admin
        .from('apartment_units')
        .select(
          `
          id,
          unit_number,
          status,
          building_id,
          notice_vacate_date,
          building:apartment_buildings (
            id,
            name,
            location
          )
        `
        )
        .eq('organization_id', orgId)
        .eq('id', activeLease.unit_id)
        .maybeSingle()
      unitSnapshot = unit || null
    }

    const snapshot = {
      tenant_profile: profile,
      active_lease: activeLease || null,
      unit: unitSnapshot,
      archived_from: 'manager_dashboard',
      archived_at_iso: new Date().toISOString(),
    }

    const { error: archErr } = await admin
      .from('tenant_archives')
      .insert({
        organization_id: orgId,
        tenant_user_id: tenantId,
        archived_by: user.id,
        reason,
        notes,
        snapshot,
        is_active: true,
      })

    const duplicateArchive = archErr?.code === '23505'
    if (archErr && !duplicateArchive) {
      return NextResponse.json({ success: false, error: archErr.message }, { status: 400 })
    }

    if (activeLease?.id) {
      const today = new Date().toISOString().slice(0, 10)
      await admin
        .from('leases')
        .update({
          status: 'ended',
          end_date: activeLease.end_date || today,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
        .eq('id', activeLease.id)
    }

    if (activeLease?.unit_id) {
      await admin
        .from('apartment_units')
        .update({
          status: 'vacant',
          notice_vacate_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
        .eq('id', activeLease.unit_id)
    }

    if (!duplicateArchive) {
      await admin.from('tenant_archive_events').insert({
        organization_id: orgId,
        tenant_user_id: tenantId,
        actor_user_id: user.id,
        event_type: 'archived',
        payload: { reason, notes, lease_id: activeLease?.id || null },
      })
    }

    return NextResponse.json({ success: true, archived: !duplicateArchive }, { status: 200 })
  } catch (e) {
    console.error('[tenant.archive] error', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed.' },
      { status: 500 }
    )
  }
}
