import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ATTACHMENT_BUCKET = 'maintenance-attachments'
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null) {
  return !!value && UUID_RE.test(value)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId')
    const yearRaw = searchParams.get('year')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!unitId || !isUuid(unitId)) {
      return NextResponse.json({ success: false, error: 'Valid unitId is required.' }, { status: 400 })
    }

    const hasCustomRange = Boolean(startDate && endDate)
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (hasCustomRange) {
      if (!dateRe.test(startDate as string) || !dateRe.test(endDate as string)) {
        return NextResponse.json({ success: false, error: 'Invalid date range.' }, { status: 400 })
      }
      if ((startDate as string) > (endDate as string)) {
        return NextResponse.json({ success: false, error: 'Start date cannot be after end date.' }, { status: 400 })
      }
    }

    const year = yearRaw ? Number(yearRaw) : new Date().getFullYear()
    if (!hasCustomRange && (!Number.isFinite(year) || year < 2000 || year > 2100)) {
      return NextResponse.json({ success: false, error: 'Valid year is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 })
    }

    const orgId = membership.organization_id
    const rangeStart = hasCustomRange ? (startDate as string) : `${year}-01-01`
    const rangeEnd = hasCustomRange ? (endDate as string) : `${year}-12-31`
    const startTs = `${rangeStart}T00:00:00Z`
    const endTs = `${rangeEnd}T23:59:59.999Z`

    const { data: unit, error: unitError } = await admin
      .from('apartment_units')
      .select(
        `
        id,
        unit_number,
        building:apartment_buildings!apartment_units_building_org_fk ( id, name, location )
      `
      )
      .eq('organization_id', orgId)
      .eq('id', unitId)
      .maybeSingle()

    if (unitError) throw unitError
    if (!unit) {
      return NextResponse.json({ success: false, error: 'Unit not found.' }, { status: 404 })
    }

    const { data: requests, error: reqError } = await admin
      .from('maintenance_requests')
      .select(
        `
        id,
        title,
        description,
        priority_level,
        status,
        created_at,
        completed_at,
        maintenance_cost,
        maintenance_cost_paid_by,
        maintenance_cost_notes,
        assigned_technician_name,
        assigned_technician_phone,
        attachment_urls,
        tenant_user_id
      `
      )
      .eq('organization_id', orgId)
      .eq('unit_id', unitId)
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .order('created_at', { ascending: false })

    if (reqError) throw reqError

    const tenantIds = Array.from(
      new Set((requests || []).map((req: any) => req.tenant_user_id).filter(Boolean))
    )

    let tenantMap = new Map<string, { full_name: string | null; phone_number: string | null }>()
    if (tenantIds.length) {
      const { data: tenantProfiles } = await admin
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .eq('organization_id', orgId)
        .in('id', tenantIds)
      tenantMap = new Map(
        (tenantProfiles || []).map((profile: any) => [profile.id, profile] as any)
      )
    }

    const attachmentPaths = Array.from(
      new Set(
        (requests || [])
          .flatMap((req: any) => req.attachment_urls || [])
          .filter((value: string) => Boolean(value) && !value.startsWith('http'))
      )
    )

    let signedUrlMap = new Map<string, string>()
    if (attachmentPaths.length) {
      const { data: signedItems, error: signedError } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(attachmentPaths, 60 * 60)
      if (!signedError && signedItems) {
        signedUrlMap = new Map(
          signedItems
            .filter((item): item is { path: string; signedUrl: string } => Boolean(item.signedUrl))
            .map((item) => [item.path, item.signedUrl])
        )
      }
    }

    const payload = (requests || []).map((req: any) => ({
      id: req.id,
      title: req.title,
      description: req.description,
      priority_level: req.priority_level,
      status: req.status,
      created_at: req.created_at,
      completed_at: req.completed_at,
      maintenance_cost: req.maintenance_cost ?? 0,
      maintenance_cost_paid_by: req.maintenance_cost_paid_by ?? 'tenant',
      maintenance_cost_notes: req.maintenance_cost_notes || null,
      assigned_technician_name: req.assigned_technician_name || null,
      assigned_technician_phone: req.assigned_technician_phone || null,
      attachment_urls: (req.attachment_urls || []).map((url: string) => {
        if (!url) return url
        if (url.startsWith('http://') || url.startsWith('https://')) return url
        return signedUrlMap.get(url) || url
      }),
      tenant: req.tenant_user_id ? tenantMap.get(req.tenant_user_id) || null : null,
    }))

    return NextResponse.json({
      success: true,
      unit,
      range: { start: rangeStart, end: rangeEnd },
      requests: payload,
    })
  } catch (error) {
    console.error('[UnitMaintenanceDetail] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load unit details.' },
      { status: 500 }
    )
  }
}
