import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: {
    id: string
  }
}

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function GET(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id || request.nextUrl.searchParams.get('tenantId') || ''

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

    const userRole = (user.user_metadata?.role as string | undefined)?.toLowerCase()
    let propertyScope: string | null =
      (user.user_metadata as any)?.property_id || (user.user_metadata as any)?.building_id || null
    if (!userRole || !MANAGER_ROLES.has(userRole)) {
      return NextResponse.json(
        { success: false, error: 'Access denied. Manager permissions required.' },
        { status: 403 }
      )
    }

    const adminSupabase = createAdminClient()
    try {
      const { data: membership } = await adminSupabase
        .from('organization_members')
        .select('property_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (membership?.property_id) {
        propertyScope = membership.property_id
      }
    } catch {
      // ignore if column missing
    }

    const { data: tenantProfile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, phone_number, profile_picture_url')
      .eq('id', tenantId)
      .maybeSingle()

    if (profileError || !tenantProfile) {
      return NextResponse.json(
        { success: false, error: 'Tenant record not found.' },
        { status: 404 }
      )
    }

    const { data: tenantLease } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        status,
        unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name,
            organization_id
          )
        )
      `
      )
      .in('status', ['active', 'pending'])
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (tenantLease?.unit?.building?.organization_id) {
      const { data: membership, error: membershipError } = await adminSupabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', tenantLease.unit.building.organization_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (membershipError) {
        throw membershipError
      }

      if (!membership && userRole !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'You are not assigned to this organization.' },
          { status: 403 }
        )
      }
    }

    if (userRole === 'caretaker' && propertyScope && tenantLease?.unit?.building?.id) {
      if (tenantLease.unit.building.id !== propertyScope) {
        return NextResponse.json(
          { success: false, error: 'You are not assigned to this property.' },
          { status: 403 }
        )
      }
    }

    const orgId = tenantLease?.unit?.building?.organization_id || null
    let staffIds: string[] = [user.id]
    if (orgId) {
      const { data: staff } = await adminSupabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
        .in('role', Array.from(MANAGER_ROLES))
      const ids = (staff || []).map((row: any) => row.user_id).filter(Boolean)
      staffIds = Array.from(new Set([...staffIds, ...ids]))
    }
    const staffList = staffIds.map((id) => id.replace(/,/g, '')).join(',')

    const { data: messages, error: messagesError } = await adminSupabase
      .from('communications')
      .select(
        'id, sender_user_id, recipient_user_id, message_text, message_type, related_entity_type, related_entity_id, read, created_at'
      )
      .or(
        `and(sender_user_id.in.(${staffList}),recipient_user_id.eq.${tenantId}),and(sender_user_id.eq.${tenantId},recipient_user_id.in.(${staffList}))`
      )
      .order('created_at', { ascending: true })

    if (messagesError) {
      throw messagesError
    }

    // Deduplicate tenant-sent messages that were fanned out to multiple staff recipients
    const seenTenantMessages = new Set<string>()
    const dedupedMessages = (messages || []).filter((msg) => {
      if (msg.sender_user_id !== tenantId) return true
      const createdAtMs = msg.created_at ? Date.parse(msg.created_at) : 0
      const timeBucket = Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 10_000) : 0
      const key = [
        msg.message_text || '',
        msg.message_type || '',
        msg.related_entity_type || '',
        msg.related_entity_id || '',
        timeBucket.toString(),
      ].join('|')
      if (seenTenantMessages.has(key)) return false
      seenTenantMessages.add(key)
      return true
    })

    await adminSupabase
      .from('communications')
      .update({ read: true })
      .eq('recipient_user_id', user.id)
      .eq('sender_user_id', tenantId)
      .eq('read', false)

    const tenantAuth = await adminSupabase.auth.admin.getUserById(tenantId).catch(() => null)

    return NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenantProfile.id,
          full_name: tenantProfile.full_name,
          phone_number: tenantProfile.phone_number,
          profile_picture_url: tenantProfile.profile_picture_url,
          email: tenantAuth?.data?.user?.email || null,
          unit_label:
            tenantLease?.unit?.unit_number && tenantLease.unit.building?.name
              ? `${tenantLease.unit.unit_number} • ${tenantLease.unit.building.name}`
              : tenantLease?.unit?.unit_number || null,
        },
        lease: tenantLease || null,
        messages: dedupedMessages,
      },
    })
  } catch (error) {
    console.error('[ManagerTenantMessages.GET] Failed to fetch conversation', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch conversation.',
      },
      { status: 500 }
    )
  }
}
