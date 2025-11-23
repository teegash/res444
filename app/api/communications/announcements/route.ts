import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithLogging } from '@/lib/sms/smsService'

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
    const { data, error } = await admin
      .from('communications')
      .select('id, message_text, created_at, message_type')
      .eq('sender_user_id', user.id)
      .eq('message_type', 'in_app')
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('[Announcements.GET] Failed to fetch announcements history', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load announcements.' },
      { status: 500 }
    )
  }
}

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
    const sendSms: boolean = Boolean(body?.send_sms)

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

    const filteredLeases =
      buildingIds.length > 0
        ? (leases || []).filter(
            (lease) => lease?.apartment_units?.building_id && buildingIds.includes(lease.apartment_units.building_id)
          )
        : leases || []

    const tenantIds = Array.from(
      new Set(
        (filteredLeases || [])
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

    let smsSent = 0
    let smsFailed = 0

    if (sendSms) {
      const { data: profiles, error: profilesError } = await admin
        .from('user_profiles')
        .select('id, phone_number')
        .in('id', tenantIds)

      if (profilesError) {
        throw profilesError
      }

      const phoneMap = (profiles || []).reduce<Record<string, string>>((acc, profile) => {
        if (profile.phone_number) {
          acc[profile.id] = profile.phone_number
        }
        return acc
      }, {})

      const smsResults = await Promise.allSettled(
        tenantIds.map(async (tenantId) => {
          const phone = phoneMap[tenantId]
          if (!phone) return { success: false, error: 'Missing phone' }
          return sendSMSWithLogging({
            phoneNumber: phone,
            message: message.trim(),
            senderUserId: user.id,
            recipientUserId: tenantId,
          })
        })
      )

      smsResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.success) {
          smsSent += 1
        } else {
          smsFailed += 1
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        recipients: tenantIds.length,
        sms_sent: smsSent,
        sms_failed: smsFailed,
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
