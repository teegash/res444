import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

type CommunicationRow = {
  id: string
  sender_user_id: string | null
  recipient_user_id: string | null
  message_text: string
  read: boolean | null
  created_at: string | null
  related_entity_type?: string | null
  message_type?: string | null
}

type ConversationSummary = {
  tenantId: string
  lastMessage: string
  lastCreatedAt: string | null
  unreadCount: number
  relatedEntityType: string | null
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

    const userRole = (user.user_metadata?.role as string | undefined)?.toLowerCase()
    if (!userRole || !MANAGER_ROLES.has(userRole)) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const propertyScope =
      (user.user_metadata as any)?.property_id ||
      (user.user_metadata as any)?.building_id ||
      membership?.property_id ||
      null

    let staffIds = new Set<string>([user.id])
    if (membership?.organization_id) {
      const { data: orgStaff, error: staffError } = await admin
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', membership.organization_id)
        .in('role', Array.from(MANAGER_ROLES))

      if (staffError) throw staffError
      (orgStaff || []).forEach((row) => {
        if (row.user_id) staffIds.add(row.user_id)
      })
    }

    const staffListArray = Array.from(staffIds).filter(Boolean).map((id) => id.replace(/,/g, ''))
    if (staffListArray.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }
    const staffList = staffListArray.join(',')

    let tenantIdsForScope: string[] | null = null
    if (userRole === 'caretaker' && propertyScope) {
      const { data: leases } = await admin
        .from('leases')
        .select('tenant_user_id, unit:apartment_units ( building_id, apartment_buildings ( organization_id ) )')
        .eq('unit.building_id', propertyScope)
        .eq('unit.apartment_buildings.organization_id', membership.organization_id)

      tenantIdsForScope = Array.from(
        new Set((leases || []).map((lease: any) => lease.tenant_user_id).filter(Boolean))
      )
      if (tenantIdsForScope.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }
    }

    const staffFilter = `sender_user_id.in.(${staffList}),recipient_user_id.in.(${staffList})`
    const tenantFilter =
      tenantIdsForScope && tenantIdsForScope.length > 0
        ? `sender_user_id.in.(${tenantIdsForScope.join(',')}),recipient_user_id.in.(${tenantIdsForScope.join(',')})`
        : null

    let orFilter = staffFilter
    if (tenantFilter) {
      // Only allow conversations between staff and scoped tenants
      orFilter = `and(sender_user_id.in.(${staffList}),recipient_user_id.in.(${tenantIdsForScope.join(',')})),and(sender_user_id.in.(${tenantIdsForScope.join(',')}),recipient_user_id.in.(${staffList}))`
    }

    const { data, error } = await admin
      .from('communications')
      .select(
        'id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, message_type'
      )
      .eq('organization_id', membership.organization_id)
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(800)

    if (error) {
      throw error
    }

    const profileIds = new Set<string>()
    const conversations = new Map<string, ConversationSummary>()
    const staffSet = staffIds

    ;(data || []).forEach((row: CommunicationRow) => {
      if (row.related_entity_type === 'payment') return
      if (row.message_type && row.message_type !== 'in_app') return

      const senderStaff = row.sender_user_id && staffSet.has(row.sender_user_id)
      const recipientStaff = row.recipient_user_id && staffSet.has(row.recipient_user_id)

      // Only consider messages between staff and tenants
      if (!senderStaff && !recipientStaff) return
      if (senderStaff && recipientStaff) return

      const otherUserId = senderStaff ? row.recipient_user_id : row.sender_user_id
      if (!otherUserId) return

      profileIds.add(otherUserId)

      const timestamp = row.created_at ? new Date(row.created_at).getTime() : 0
      const existing = conversations.get(otherUserId)

      if (!existing || timestamp > (existing.lastCreatedAt ? new Date(existing.lastCreatedAt).getTime() : 0)) {
        conversations.set(otherUserId, {
          tenantId: otherUserId,
          lastMessage: row.message_text,
          lastCreatedAt: row.created_at,
          unreadCount: 0,
          relatedEntityType: row.related_entity_type || null,
        })
      }

      if (row.recipient_user_id && staffSet.has(row.recipient_user_id) && row.read === false) {
        const entry = conversations.get(otherUserId)
        if (entry) {
          entry.unreadCount += 1
        } else {
          conversations.set(otherUserId, {
            tenantId: otherUserId,
            lastMessage: row.message_text,
            lastCreatedAt: row.created_at,
            unreadCount: 1,
            relatedEntityType: row.related_entity_type || null,
          })
        }
      }
    })

    let allowedTenantIds = Array.from(profileIds)
    if (userRole === 'caretaker' && tenantIdsForScope) {
      allowedTenantIds = allowedTenantIds.filter((id) => tenantIdsForScope!.includes(id))
    }

    let profileMap = new Map<string, { full_name: string | null }>()
    if (allowedTenantIds.length > 0) {
      const { data: profiles, error: profileError } = await admin
        .from('user_profiles')
        .select('id, full_name')
        .eq('organization_id', membership.organization_id)
        .in('id', allowedTenantIds)

      if (profileError) {
        throw profileError
      }

      profileMap = new Map((profiles || []).map((profile) => [profile.id, { full_name: profile.full_name }]))
    }

    const payload = Array.from(conversations.values())
      .filter((conversation) => allowedTenantIds.includes(conversation.tenantId))
      .map((conversation) => ({
        tenantId: conversation.tenantId,
        tenantName: profileMap.get(conversation.tenantId)?.full_name || 'Tenant',
        lastMessage: conversation.lastMessage,
        lastCreatedAt: conversation.lastCreatedAt,
        unreadCount: conversation.unreadCount,
        relatedEntityType: conversation.relatedEntityType,
      }))
      .sort((a, b) => {
        const aTime = a.lastCreatedAt ? new Date(a.lastCreatedAt).getTime() : 0
        const bTime = b.lastCreatedAt ? new Date(b.lastCreatedAt).getTime() : 0
        return bTime - aTime
      })

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[CommunicationsMessages.GET] Failed to load inbox', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load messages.',
      },
      { status: 500 }
    )
  }
}
