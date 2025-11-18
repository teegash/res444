import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const STATUS_DEFAULT = 'open'

type PriorityLevel = (typeof PRIORITIES)[number]

function normalizePriority(value?: string | null): PriorityLevel {
  if (!value) return 'medium'
  const normalized = value.toLowerCase() as PriorityLevel
  return PRIORITIES.includes(normalized) ? normalized : 'medium'
}

function formatDescription({
  description,
  category,
  location,
  contactPreference,
  contactTime,
}: {
  description: string
  category?: string
  location?: string
  contactPreference?: string
  contactTime?: string
}) {
  const sections = [description.trim()]

  if (category) {
    sections.push(`Category: ${category}`)
  }
  if (location) {
    sections.push(`Location: ${location}`)
  }
  if (contactPreference) {
    sections.push(`Preferred contact: ${contactPreference}`)
  }
  if (contactTime) {
    sections.push(`Availability: ${contactTime}`)
  }

  return sections.join('\n')
}

function formatRequestPayload(request: any) {
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    priority_level: request.priority_level,
    status: request.status,
    created_at: request.created_at,
    updated_at: request.updated_at,
    completed_at: request.completed_at,
    attachment_urls: request.attachment_urls || [],
    tenant: request.tenant || null,
    unit: request.unit || null,
    assigned_to: request.assigned_to,
    assigned_to_name: request.assigned_to_name || null,
  }
}

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
        attachment_urls,
        assigned_to,
        tenant_user_id,
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
      .eq('tenant_user_id', user.id)
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

      tenantMap = new Map((tenantProfiles || []).map((profile) => [profile.id, profile]))
    }

    const assignedIds = (data || [])
      .map((request) => request.assigned_to)
      .filter((value): value is string => Boolean(value))

    let assignedMap = new Map<string, string>()
    if (assignedIds.length > 0) {
      const { data: assignedProfiles, error: assignedError } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', assignedIds)

      if (assignedError) {
        throw assignedError
      }

      assignedMap = new Map(
        (assignedProfiles || []).map((profile) => [profile.id, profile.full_name || 'Assigned technician'])
      )
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((request) =>
        formatRequestPayload({
          ...request,
          tenant: request.tenant_user_id ? tenantMap.get(request.tenant_user_id) || null : null,
          assigned_to_name: request.assigned_to ? assignedMap.get(request.assigned_to) || null : null,
        })
      ),
    })
  } catch (error) {
    console.error('[TenantMaintenance.GET] Failed to fetch requests', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load maintenance requests.',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 })
    }

    const { title, description, priorityLevel, category, location, contactPreference, contactTime, attachmentUrls } =
      body as {
        title?: string
        description?: string
        priorityLevel?: string
        category?: string
        location?: string
        contactPreference?: string
        contactTime?: string
        attachmentUrls?: string[]
      }

    if (!title || !description) {
      return NextResponse.json(
        { success: false, error: 'Title and description are required.' },
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
    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        tenant_user_id,
        status,
        unit:apartment_units (
          id,
          unit_number,
          building:apartment_buildings (
            id,
            name
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    if (!lease?.unit?.id) {
      return NextResponse.json(
        { success: false, error: 'No active lease/unit found for this tenant.' },
        { status: 400 }
      )
    }

    const composedDescription = formatDescription({
      description,
      category,
      location,
      contactPreference,
      contactTime,
    })

    const normalizedPriority = normalizePriority(priorityLevel)
    const attachments = Array.isArray(attachmentUrls)
      ? attachmentUrls.filter((url) => typeof url === 'string' && url.length > 0)
      : []

    const { data: inserted, error: insertError } = await adminSupabase
      .from('maintenance_requests')
      .insert({
        unit_id: lease.unit.id,
        tenant_user_id: user.id,
        title: title.trim(),
        description: composedDescription,
        priority_level: normalizedPriority,
        status: STATUS_DEFAULT,
        attachment_urls: attachments.length > 0 ? attachments : null,
      })
      .select('id, created_at')
      .single()

    if (insertError || !inserted) {
      throw insertError || new Error('Failed to create maintenance request.')
    }

    await adminSupabase.from('communications').insert({
      sender_user_id: user.id,
      recipient_user_id: user.id,
      related_entity_type: 'maintenance_request',
      related_entity_id: inserted.id,
      message_text: 'Maintenance request received. We will update you soon.',
      message_type: 'in_app',
      read: false,
    })

    const { data: managers } = await adminSupabase
      .from('user_profiles')
      .select('id')
      .in('role', ['admin', 'manager', 'caretaker'])

    const managerIds =
      managers
        ?.map((profile) => profile.id)
        .filter((id): id is string => Boolean(id) && id !== user.id) || []
    if (managerIds.length > 0) {
      const notificationRows = managerIds.map((managerId) => ({
        sender_user_id: user.id,
        recipient_user_id: managerId,
        related_entity_type: 'maintenance_request',
        related_entity_id: inserted.id,
        message_text: `New maintenance request: ${title.trim()}`,
        message_type: 'in_app',
        read: false,
      }))

      await adminSupabase.from('communications').insert(notificationRows)
    }

    return NextResponse.json({ success: true, data: inserted })
  } catch (error) {
    console.error('[TenantMaintenance.POST] Failed to create request', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit maintenance request.',
      },
      { status: 500 }
    )
  }
}
