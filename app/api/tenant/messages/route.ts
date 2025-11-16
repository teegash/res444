import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function pickRecipient(members: Array<{ user_id: string; role: string }>) {
  if (!members?.length) return null
  const priority = ['manager', 'admin', 'caretaker']
  for (const role of priority) {
    const match = members.find((member) => member.role === role)
    if (match) return match.user_id
  }
  return members[0]?.user_id || null
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
      .from('communications')
      .select('id, sender_user_id, recipient_user_id, message_text, read, created_at')
      .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) {
      throw error
    }

    const userIds = Array.from(
      new Set(
        (data || [])
          .flatMap((row) => [row.sender_user_id, row.recipient_user_id])
          .filter((id): id is string => Boolean(id))
      )
    )

    let profiles: Array<{ id: string; full_name: string | null }> = []
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds)

      if (profileError) {
        throw profileError
      }
      profiles = profileData || []
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || null]))

    const payload = (data || []).map((message) => ({
      ...message,
      sender_name:
        message.sender_user_id === user.id
          ? 'You'
          : profileMap.get(message.sender_user_id) || 'Property Management',
    }))

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[TenantMessages.GET] Failed to load communications', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load messages.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { message } = body || {}

    if (!message || !message.toString().trim()) {
      return NextResponse.json(
        { success: false, error: 'Message text is required.' },
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
        status,
        unit:apartment_units (
          id,
          building:apartment_buildings (
            id,
            organization_id
          )
        )
      `
      )
      .eq('tenant_user_id', user.id)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    const organizationId = lease?.unit?.building?.organization_id
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: 'Could not determine your property team. Contact support.' },
        { status: 400 }
      )
    }

    const { data: orgMembers, error: orgError } = await adminSupabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .in('role', ['admin', 'manager', 'caretaker'])

    if (orgError) {
      throw orgError
    }

    const recipientUserId = pickRecipient(orgMembers || [])

    if (!recipientUserId) {
      return NextResponse.json(
        { success: false, error: 'No organization contact available to receive the message.' },
        { status: 400 }
      )
    }

    const { data, error: insertError } = await adminSupabase
      .from('communications')
      .insert({
        sender_user_id: user.id,
        recipient_user_id: recipientUserId,
        message_text: message.toString().trim(),
        message_type: 'in_app',
        related_entity_type: lease?.id ? 'lease' : null,
        related_entity_id: lease?.id || null,
        read: false,
      })
      .select('id, sender_user_id, recipient_user_id, message_text, read, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[TenantMessages.POST] Failed to send message', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to send message.' },
      { status: 500 }
    )
  }
}
