import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
const ATTACHMENT_BUCKET = 'maintenance-attachments'

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
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[ManagerMaintenance.GET] membership lookup failed', membershipError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

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
        maintenance_cost,
        maintenance_cost_paid_by,
        maintenance_cost_notes,
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
      .eq('organization_id', membership.organization_id)
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
        .eq('organization_id', membership.organization_id)
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
        .eq('organization_id', membership.organization_id)
        .in('id', assignedIds)

      assignedMap = new Map(
        (assignedProfiles || [])
          .filter((profile): profile is { id: string; full_name: string | null } => Boolean(profile.id))
          .map((profile) => [profile.id, profile.full_name || 'Assigned technician'])
      )
    }

    const attachmentPaths = Array.from(
      new Set(
        (data || [])
          .flatMap((request) => request.attachment_urls || [])
          .filter((value): value is string => Boolean(value) && !value.startsWith('http'))
      )
    )

    let signedUrlMap = new Map<string, string>()
    if (attachmentPaths.length > 0) {
      const { data: signedItems, error: signedError } = await adminSupabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(attachmentPaths, 60 * 60)

      if (signedError) {
        console.error('[ManagerMaintenance.GET] signed url error', signedError)
      } else if (signedItems) {
        signedUrlMap = new Map(
          signedItems
            .filter((item): item is { path: string; signedUrl: string } => Boolean(item.signedUrl))
            .map((item) => [item.path, item.signedUrl])
        )
      }
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
      attachment_urls: (request.attachment_urls || []).map((url) => {
        if (!url) return url
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url
        }
        return signedUrlMap.get(url) || url
      }),
      tenant: request.tenant_user_id ? tenantMap.get(request.tenant_user_id) || null : null,
      unit: request.unit || null,
      assigned_to: request.assigned_to,
      assigned_technician_phone: request.assigned_technician_phone || null,
      assigned_to_name:
        request.assigned_technician_name ||
        (request.assigned_to ? assignedMap.get(request.assigned_to) || null : null),
      maintenance_cost: request.maintenance_cost ?? 0,
      maintenance_cost_paid_by: request.maintenance_cost_paid_by ?? 'tenant',
      maintenance_cost_notes: request.maintenance_cost_notes || null,
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

    const { action = 'assign', requestId } = body as {
      action?: 'assign' | 'complete'
      requestId?: string
      technicianName?: string
      technicianPhone?: string
    }

    if (!requestId) {
      return NextResponse.json({ success: false, error: 'Request ID is required.' }, { status: 400 })
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
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole = membership?.role
    if (
      !membership?.organization_id ||
      !callerRole ||
      !['admin', 'manager', 'caretaker'].includes(String(callerRole).toLowerCase())
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'assign') {
      return NextResponse.json(
        {
          success: false,
          error: 'Legacy assign endpoint deprecated. Use /api/maintenance-requests/[id]/assign-technician.',
        },
        { status: 410 }
      )
    }

    const { data: targetRequest, error: targetError } = await adminSupabase
      .from('maintenance_requests')
      .select('id, tenant_user_id, title, organization_id')
      .eq('id', requestId)
      .maybeSingle()

    if (targetError) {
      throw targetError
    }

    if (!targetRequest || targetRequest.organization_id !== membership.organization_id) {
      return NextResponse.json({ success: false, error: 'Request not found.' }, { status: 404 })
    }

    if (action === 'complete') {
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await adminSupabase
        .from('maintenance_requests')
        .update({
          status: 'completed',
          completed_at: now,
          updated_at: now,
        })
        .eq('id', requestId)
        .eq('organization_id', membership.organization_id)
        .select('id, title, status, completed_at, tenant_user_id')
        .single()

      if (updateError || !updated) {
        throw updateError || new Error('Failed to mark request complete.')
      }

      await adminSupabase.from('communications').insert({
        sender_user_id: user.id,
        recipient_user_id: updated.tenant_user_id,
        organization_id: membership.organization_id,
        related_entity_type: 'maintenance_request',
        related_entity_id: updated.id,
        message_text: `Your maintenance request "${updated.title}" has been marked as complete.`,
        message_type: 'in_app',
        read: false,
      })

      const { data: staffRows, error: staffErr } = await adminSupabase
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', membership.organization_id)
        .in('role', ['admin', 'manager', 'caretaker'])

      if (staffErr) {
        console.error('[ManagerMaintenance.PATCH] Failed to resolve staff ids', staffErr)
      } else {
        const staffIds = (staffRows || []).map((row: any) => row.user_id).filter(Boolean)
        if (staffIds.length) {
          const { error: clearErr } = await adminSupabase
            .from('communications')
            .update({ read: true })
            .eq('organization_id', membership.organization_id)
            .eq('related_entity_type', 'maintenance_request')
            .eq('related_entity_id', updated.id)
            .in('recipient_user_id', staffIds)
          if (clearErr) {
            console.error('[ManagerMaintenance.PATCH] Failed to clear staff notifications', clearErr)
          }
        }
      }

      return NextResponse.json({ success: true, data: updated })
    }

    return NextResponse.json({ success: false, error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[ManagerMaintenance.PATCH] Failed to update request', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update maintenance request.',
      },
      { status: 500 }
    )
  }
}
