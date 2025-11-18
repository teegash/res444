import { NextResponse } from 'next/server'
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
      assigned_to_name: request.assigned_to ? assignedMap.get(request.assigned_to) || null : null,
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
