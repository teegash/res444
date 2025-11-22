import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
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
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership?.organization_id) {
      return NextResponse.json(
        { success: false, error: 'You are not assigned to any organization.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const message: string = body?.message
    const buildingIds: string[] = Array.isArray(body?.building_ids) ? body.building_ids : []

    if (!message || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'Announcement message is required.' },
        { status: 400 }
      )
    }

    // Fetch tenants for selected buildings (or all)
    let query = admin
      .from('leases')
      .select(
        `
        tenant_user_id,
        status,
        apartment_units (
          building_id,
          apartment_buildings (
            organization_id
          )
        )
      `
      )
      .in('status', ['active', 'pending'])

    if (buildingIds.length > 0) {
      query = query.in('apartment_units.building_id', buildingIds)
    } else {
      query = query.eq('apartment_units.apartment_buildings.organization_id', membership.organization_id)
    }

    const { data: leases, error: leaseError } = await query

    if (leaseError) {
      throw leaseError
    }

    const tenantIds = Array.from(
      new Set(
        (leases || [])
          .map((lease) => lease?.tenant_user_id)
          .filter((tenantId): tenantId is string => Boolean(tenantId))
      )
    )

    if (tenantIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No tenants found for the selected properties.' },
        { status: 400 }
      )
    }

    const communicationRows = tenantIds.map((tenantId) => ({
      sender_user_id: user.id,
      recipient_user_id: tenantId,
      message_text: message.trim(),
      message_type: 'in_app',
      read: false,
    }))

    const { error: insertError } = await admin.from('communications').insert(communicationRows)

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({
      success: true,
      data: {
        recipients: tenantIds.length,
      },
    })
  } catch (error) {
    console.error('[Announcements] Failed to send announcement', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send announcement.' },
      { status: 500 }
    )
  }
}
