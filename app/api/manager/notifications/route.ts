import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

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

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id
    const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
    if (role && !MANAGER_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
    }

    let leaseExpiredNotifications: Array<{
      id: string
      sender_user_id: string | null
      recipient_user_id: string
      message_text: string
      read: boolean
      created_at: string
      related_entity_type: string
      related_entity_id: string
      message_type: string
    }> = []

    try {
      const { data: tenantProfiles } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .eq('role', 'tenant')
        .order('created_at', { ascending: false })

      const tenantIds = (tenantProfiles || []).map((profile: any) => profile.id).filter(Boolean)
      const tenantMap = new Map<string, string>()
      ;(tenantProfiles || []).forEach((profile: any) => {
        if (profile?.id) tenantMap.set(profile.id, profile.full_name || 'Tenant')
      })

      let leases: any[] = []
      if (tenantIds.length > 0) {
        const { data: leaseRows } = await adminSupabase
          .from('leases')
          .select(
            `
            id,
            tenant_user_id,
            status,
            start_date,
            end_date,
            unit:apartment_units (
              unit_number,
              building:apartment_buildings (
                name
              )
            )
          `
          )
          .eq('organization_id', orgId)
          .in('tenant_user_id', tenantIds)
          .in('status', ['active', 'pending', 'renewed'])
          .order('start_date', { ascending: false })

        leases = leaseRows || []
      }

      const leaseMap = new Map<string, any>()
      for (const lease of leases) {
        if (!lease?.tenant_user_id) continue
        if (!leaseMap.has(lease.tenant_user_id)) {
          leaseMap.set(lease.tenant_user_id, lease)
        }
      }

      const isExpiredLease = (lease: any) => {
        const status = String(lease?.status || '').toLowerCase()
        if (status === 'expired') return true
        if (!lease?.end_date) return false
        const parsed = new Date(lease.end_date)
        if (Number.isNaN(parsed.getTime())) return false
        const today = new Date()
        const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
        const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        return currentDay > endDay
      }

      const expiredLeases = Array.from(leaseMap.entries())
        .map(([tenantId, lease]) => ({ tenantId, lease }))
        .filter((entry) => isExpiredLease(entry.lease))

      leaseExpiredNotifications = expiredLeases
        .map((entry) => {
          const lease = entry.lease
          if (!lease?.id) return null
          const tenantId = entry.tenantId
          const tenantName = tenantId ? tenantMap.get(tenantId) || 'Tenant' : 'Tenant'
          const unitNumber = lease?.unit?.unit_number
          const buildingName = lease?.unit?.building?.name
          const unitLabel = unitNumber && buildingName ? `${unitNumber} • ${buildingName}` : unitNumber || 'Unassigned'
          const endDate = lease?.end_date
            ? new Date(lease.end_date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'Unknown'
          const messageText = `Lease expired: ${tenantName} • ${unitLabel} (ended ${endDate}).`
          return {
            id: `lease-expired-${lease.id}`,
            sender_user_id: tenantId || null,
            recipient_user_id: user.id,
            related_entity_type: 'lease_expired',
            related_entity_id: lease.id,
            message_text: messageText,
            message_type: 'in_app',
            read: false,
            created_at: lease?.end_date
              ? new Date(lease.end_date).toISOString()
              : new Date().toISOString(),
          }
        })
        .filter(Boolean) as typeof leaseExpiredNotifications
    } catch (notifyError) {
      console.error('[ManagerNotifications.GET] Lease-expired notification sync failed', notifyError)
    }

    const { data, error } = await adminSupabase
      .from('communications')
      .select('id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, related_entity_id, message_type')
      .eq('recipient_user_id', user.id)
      .eq('organization_id', orgId)
      .neq('related_entity_type', 'lease_expired')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      throw error
    }

    const rows = [...leaseExpiredNotifications, ...(data || [])]

    const unreadCount = rows.filter((item) => item.read === false).length

    return NextResponse.json({ success: true, data: rows, unreadCount })
  } catch (error) {
    console.error('[ManagerNotifications.GET] Failed to fetch notifications', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch notifications.',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { ids } = await request.json().catch(() => ({}))

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true })
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
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id

    const { error } = await adminSupabase
      .from('communications')
      .update({ read: true })
      .in('id', ids)
      .eq('recipient_user_id', user.id)
      .eq('organization_id', orgId)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ManagerNotifications.PATCH] Failed to mark notifications read', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update notifications.',
      },
      { status: 500 }
    )
  }
}
