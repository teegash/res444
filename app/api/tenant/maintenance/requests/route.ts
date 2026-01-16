import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ATTACHMENT_BUCKET = 'maintenance-attachments'

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
    maintenance_cost: request.maintenance_cost ?? 0,
    maintenance_cost_paid_by: request.maintenance_cost_paid_by ?? 'tenant',
    maintenance_cost_notes: request.maintenance_cost_notes || null,
    attachment_urls: request.attachment_urls || [],
    tenant: request.tenant || null,
    unit: request.unit || null,
    assigned_to: request.assigned_to,
    assigned_to_name: request.assigned_to_name || null,
    assigned_technician_phone: request.assigned_technician_phone || null,
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
    const { data: profile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('[TenantMaintenance.GET] profile lookup failed', profileError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    let orgId = (profile as any)?.organization_id as string | undefined
    if (!orgId) {
      const { data: membership, error: membershipError } = await adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (membershipError) {
        console.error('[TenantMaintenance.GET] membership lookup failed', membershipError)
        return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
      }

      orgId = membership?.organization_id || undefined
    }
    if (!orgId) {
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
        attachment_urls,
        maintenance_cost,
        maintenance_cost_paid_by,
        maintenance_cost_notes,
        assigned_to,
        assigned_technician_name,
        assigned_technician_phone,
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
      .eq('organization_id', orgId)
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
        console.error('[TenantMaintenance.GET] signed url error', signedError)
      } else if (signedItems) {
        signedUrlMap = new Map(
          signedItems
            .filter((item): item is { path: string; signedUrl: string } => Boolean(item.signedUrl))
            .map((item) => [item.path, item.signedUrl])
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((request) =>
        formatRequestPayload({
          ...request,
          attachment_urls: (request.attachment_urls || []).map((url) => {
            if (!url) return url
            if (url.startsWith('http://') || url.startsWith('https://')) return url
            return signedUrlMap.get(url) || url
          }),
          tenant: request.tenant_user_id ? tenantMap.get(request.tenant_user_id) || null : null,
          assigned_to_name:
            request.assigned_technician_name ||
            (request.assigned_to ? assignedMap.get(request.assigned_to) || null : null),
          assigned_technician_phone: request.assigned_technician_phone || null,
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
    const { data: profile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('[TenantMaintenance.POST] profile lookup failed', profileError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    const orgId = (profile as any)?.organization_id as string | undefined
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        organization_id,
        tenant_user_id,
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
      .eq('tenant_user_id', user.id)
      .eq('organization_id', orgId)
      .in('status', ['active', 'pending', 'renewed'])
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
        organization_id: orgId,
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
      message_text:
        'Thank you for submitting your maintenance request. Our property team will reach out shortly.',
      message_type: 'in_app',
      read: false,
      organization_id: orgId,
    })

    const { data: managers } = await adminSupabase
      .from('user_profiles')
      .select('id')
      .eq('organization_id', orgId)
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
        organization_id: orgId,
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
