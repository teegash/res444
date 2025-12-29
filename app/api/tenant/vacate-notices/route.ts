import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'tenant-notices'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg'])

function sanitizeFileName(name: string) {
  const base = String(name || 'notice')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.\-_]/g, '')
  return base || 'notice'
}

function parseDateOnly(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
  const [y, m, d] = base.split('-').map((part) => Number(part))
  if (y && m && d) {
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function getMinNoticeDate() {
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  todayUtc.setUTCDate(todayUtc.getUTCDate() + 30)
  return todayUtc
}

async function fetchCurrentLease(admin: ReturnType<typeof createAdminClient>, tenantUserId: string, leaseId?: string) {
  if (leaseId) {
    const { data } = await admin
      .from('leases')
      .select('id, organization_id, unit_id, tenant_user_id, end_date, status, unit:apartment_units(unit_number, building:apartment_buildings(name))')
      .eq('id', leaseId)
      .eq('tenant_user_id', tenantUserId)
      .maybeSingle()
    return data || null
  }

  const { data } = await admin
    .from('leases')
    .select('id, organization_id, unit_id, tenant_user_id, end_date, status, unit:apartment_units(unit_number, building:apartment_buildings(name))')
    .eq('tenant_user_id', tenantUserId)
    .in('status', ['active', 'pending', 'renewed'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

async function logNoticeEvent(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    notice_id: string
    organization_id: string
    actor_user_id: string | null
    action: string
    metadata?: any
  }
) {
  const { error } = await admin.from('tenant_vacate_notice_events').insert({
    notice_id: args.notice_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id,
    action: args.action,
    metadata: args.metadata ?? {},
  })
  if (error) {
    throw new Error(error.message)
  }
}

async function notifyManagers(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  senderUserId: string,
  message: string,
  noticeId: string
) {
  const { data: members } = await admin
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'manager', 'caretaker'])

  const rows =
    members
      ?.map((member) => member.user_id)
      .filter((id): id is string => Boolean(id) && id !== senderUserId)
      .map((recipientId) => ({
        sender_user_id: senderUserId,
        recipient_user_id: recipientId,
        related_entity_type: 'vacate_notice',
        related_entity_id: noticeId,
        message_text: message,
        message_type: 'in_app',
        read: false,
        organization_id: orgId,
      })) || []

  if (rows.length > 0) {
    const { error } = await admin.from('communications').insert(rows)
    if (error) {
      throw new Error(error.message)
    }
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

    const admin = createAdminClient()
    const lease = await fetchCurrentLease(admin, user.id)
    if (!lease?.id) {
      return NextResponse.json({ success: true, notice: null, events: [] })
    }

    const { data: notice } = await admin
      .from('tenant_vacate_notices')
      .select('*')
      .eq('organization_id', lease.organization_id)
      .eq('lease_id', lease.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!notice) {
      return NextResponse.json({ success: true, notice: null, events: [] })
    }

    const { data: events } = await admin
      .from('tenant_vacate_notice_events')
      .select('*')
      .eq('organization_id', lease.organization_id)
      .eq('notice_id', notice.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ success: true, notice, events: events || [] })
  } catch (error) {
    console.error('[TenantVacateNotices.GET] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load vacate notice.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const requestedDateRaw = String(form.get('requested_vacate_date') || '').trim()
    const leaseId = String(form.get('lease_id') || '').trim() || undefined
    const file = form.get('file')

    if (!requestedDateRaw) {
      return NextResponse.json({ success: false, error: 'Requested vacate date is required.' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Notice document is required.' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Upload a PDF or image.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const requestedDate = parseDateOnly(requestedDateRaw)
    if (!requestedDate) {
      return NextResponse.json({ success: false, error: 'Requested vacate date is invalid.' }, { status: 400 })
    }

    const minDate = getMinNoticeDate()
    if (requestedDate < minDate) {
      return NextResponse.json(
        { success: false, error: 'Vacate date must be at least 30 days from today.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const lease = await fetchCurrentLease(admin, user.id, leaseId)
    if (!lease?.id || !lease.organization_id) {
      return NextResponse.json({ success: false, error: 'Active lease not found.' }, { status: 404 })
    }

    const { data: notice, error: noticeError } = await admin
      .from('tenant_vacate_notices')
      .insert({
        organization_id: lease.organization_id,
        lease_id: lease.id,
        unit_id: lease.unit_id,
        tenant_user_id: user.id,
        requested_vacate_date: requestedDate.toISOString().slice(0, 10),
        status: 'submitted',
        notice_submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (noticeError || !notice?.id) {
      if (noticeError?.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'An active vacate notice already exists for this lease.' },
          { status: 409 }
        )
      }
      throw noticeError || new Error('Failed to create vacate notice.')
    }

    let uploadedPath = ''
    try {
      const safeName = sanitizeFileName(file.name)
      const path = `org-${lease.organization_id}/tenant-${user.id}/notice-${notice.id}/${Date.now()}-${safeName}`

      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      uploadedPath = path

      const { error: updateError } = await admin
        .from('tenant_vacate_notices')
        .update({ notice_document_url: path })
        .eq('id', notice.id)

      if (updateError) {
        throw updateError
      }

      await logNoticeEvent(admin, {
        notice_id: notice.id,
        organization_id: lease.organization_id,
        actor_user_id: user.id,
        action: 'submitted',
        metadata: { requested_vacate_date: requestedDate.toISOString().slice(0, 10) },
      })

      const unitLabel = lease.unit?.unit_number || 'Unit'
      const buildingName = lease.unit?.building?.name || 'Property'
      const requestedLabel = requestedDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      const message = `Tenant submitted a vacate notice for ${unitLabel} • ${buildingName}. Requested move-out: ${requestedLabel}.`

      try {
        await notifyManagers(admin, lease.organization_id, user.id, message, notice.id)
      } catch (notifyErr) {
        console.error('[TenantVacateNotices] manager notifications failed', notifyErr)
      }
    } catch (err) {
      if (uploadedPath) {
        await admin.storage.from(BUCKET).remove([uploadedPath])
      }
      await admin.from('tenant_vacate_notices').delete().eq('id', notice.id)
      throw err
    }

    return NextResponse.json({ success: true, noticeId: notice.id })
  } catch (error) {
    console.error('[TenantVacateNotices.POST] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to submit vacate notice.' },
      { status: 500 }
    )
  }
}
