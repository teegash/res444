import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const { data, error } = await adminSupabase
      .from('maintenance_requests')
      .select(
        `
        id,
        title,
        description,
        priority_level,
        status,
        created_at,
        updated_at,
        completed_at,
        tenant_user_id,
        assigned_to,
        assigned_technician_name,
        assigned_technician_phone,
        attachment_urls,
        unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const tenantIds = (data || [])
      .map((request) => request.tenant_user_id)
      .filter((value): value is string => Boolean(value))

    let tenantMap = new Map<string, { id: string; full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length > 0) {
      const { data: tenantProfiles, error: tenantError } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .in('id', tenantIds)

      if (tenantError) {
        throw tenantError
      }

      tenantMap = new Map(
        (tenantProfiles || []).map((profile) => [profile.id, profile])
      )
    }

    const assignedIds = (data || [])
      .map((request) => request.assigned_to)
      .filter((value): value is string => Boolean(value))

    let assignedMap = new Map<string, string>()
    if (assignedIds.length > 0) {
      const { data: assignedProfiles } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', assignedIds)

      assignedMap = new Map(
        (assignedProfiles || [])
          .filter((profile): profile is { id: string; full_name: string | null } => Boolean(profile.id))
          .map((profile) => [profile.id, profile.full_name || 'Assigned technician'])
      )
    }

    const payload = (data || []).map((request) => ({
      id: request.id,
      title: request.title,
      description: request.description,
      priority_level: request.priority_level,
      status: request.status,
      created_at: request.created_at,
      updated_at: request.updated_at,
      completed_at: request.completed_at,
      attachment_urls: request.attachment_urls || [],
      tenant: request.tenant_user_id ? tenantMap.get(request.tenant_user_id) || null : null,
      unit: request.unit || null,
      assigned_to: request.assigned_to,
      assigned_technician_phone: request.assigned_technician_phone || null,
      assigned_to_name:
        request.assigned_technician_name ||
        (request.assigned_to ? assignedMap.get(request.assigned_to) || null : null),
    }))

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[ManagerMaintenance.GET] Failed to fetch requests', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load maintenance requests.',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 })
    }

    const { requestId, technicianName, technicianPhone } = body as {
      requestId?: string
      technicianName?: string
      technicianPhone?: string
    }

    if (!requestId || !technicianName?.trim() || !technicianPhone?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Technician name and phone are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const { data: profile } = await adminSupabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || !profile.role || !['admin', 'manager', 'caretaker'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: targetRequest, error: targetError } = await adminSupabase
      .from('maintenance_requests')
      .select('id, tenant_user_id')
      .eq('id', requestId)
      .maybeSingle()

    if (targetError) {
      throw targetError
    }

    if (!targetRequest) {
      return NextResponse.json({ success: false, error: 'Request not found.' }, { status: 404 })
    }

    const trimmedName = technicianName.trim()
    const trimmedPhone = technicianPhone.trim()

    const { data: updated, error: updateError } = await adminSupabase
      .from('maintenance_requests')
      .update({
        assigned_technician_name: trimmedName,
        assigned_technician_phone: trimmedPhone,
        status: 'assigned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('id, title, status, assigned_technician_name, assigned_technician_phone, tenant_user_id')
      .single()

    if (updateError || !updated) {
      throw updateError || new Error('Failed to assign technician.')
    }

    await adminSupabase.from('communications').insert({
      sender_user_id: user.id,
      recipient_user_id: updated.tenant_user_id,
      related_entity_type: 'maintenance_request',
      related_entity_id: updated.id,
      message_text: `Technician ${trimmedName} has been assigned (${trimmedPhone}).`,
      message_type: 'in_app',
      read: false,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[ManagerMaintenance.PATCH] Failed to assign technician', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign technician.',
      },
      { status: 500 }
    )
  }
}
