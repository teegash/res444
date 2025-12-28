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

    const userRole = (user.user_metadata?.role as string | undefined)?.toLowerCase()
    if (!userRole || !MANAGER_ROLES.has(userRole)) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
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

    try {
      const nowIso = new Date().toISOString()
      const { data: expiredLeases } = await adminSupabase
        .from('leases')
        .select(
          `
          id,
          tenant_user_id,
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
        .or(`end_date.lt.${nowIso},status.eq.expired`)

      const expiredLeaseIds = new Set<string>(
        (expiredLeases || []).map((lease: any) => lease?.id).filter(Boolean)
      )

      const tenantIds = Array.from(
        new Set((expiredLeases || []).map((lease: any) => lease?.tenant_user_id).filter(Boolean))
      )

      const { data: tenantProfiles } = tenantIds.length
        ? await adminSupabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', tenantIds)
        : { data: [] }

      const tenantMap = new Map<string, string>()
      ;(tenantProfiles || []).forEach((profile: any) => {
        if (profile?.id) tenantMap.set(profile.id, profile.full_name || 'Tenant')
      })

      const { data: managers } = await adminSupabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
        .in('role', ['admin', 'manager', 'caretaker'])

      const managerIds =
        managers?.map((profile: any) => profile.user_id).filter((id: string | null) => Boolean(id)) || []

      if (managerIds.length > 0) {
        const { data: existingNotifs } = await adminSupabase
          .from('communications')
          .select('id, recipient_user_id, related_entity_id, read')
          .eq('organization_id', orgId)
          .eq('related_entity_type', 'lease_expired')
          .in('recipient_user_id', managerIds)

        const existingMap = new Set<string>()
        ;(existingNotifs || []).forEach((row: any) => {
          if (row?.recipient_user_id && row?.related_entity_id) {
            existingMap.add(`${row.recipient_user_id}:${row.related_entity_id}`)
          }
        })

        const rowsToInsert = (expiredLeases || []).flatMap((lease: any) => {
          if (!lease?.id) return []
          const tenantId = lease.tenant_user_id
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
          return managerIds
            .filter((managerId: string) => !existingMap.has(`${managerId}:${lease.id}`))
            .map((managerId: string) => ({
              sender_user_id: tenantId || null,
              recipient_user_id: managerId,
              related_entity_type: 'lease_expired',
              related_entity_id: lease.id,
              message_text: messageText,
              message_type: 'in_app',
              read: false,
              organization_id: orgId,
            }))
        })

        if (rowsToInsert.length > 0) {
          await adminSupabase.from('communications').insert(rowsToInsert)
        }

        const reopenIds =
          (existingNotifs || [])
            .filter(
              (row: any) =>
                row?.related_entity_id &&
                expiredLeaseIds.has(row.related_entity_id) &&
                row.read === true
            )
            .map((row: any) => row.id) || []

        if (reopenIds.length > 0) {
          await adminSupabase
            .from('communications')
            .update({ read: false })
            .in('id', reopenIds)
        }

        const clearIds =
          (existingNotifs || [])
            .filter(
              (row: any) =>
                row?.related_entity_id &&
                !expiredLeaseIds.has(row.related_entity_id) &&
                row.read === false
            )
            .map((row: any) => row.id) || []

        if (clearIds.length > 0) {
          await adminSupabase
            .from('communications')
            .update({ read: true })
            .in('id', clearIds)
        }
      }
    } catch (notifyError) {
      console.error('[ManagerNotifications.GET] Lease-expired notification sync failed', notifyError)
    }

    const { data, error } = await adminSupabase
      .from('communications')
      .select('id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, related_entity_id, message_type')
      .eq('recipient_user_id', user.id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      throw error
    }

    const unreadCount = (data || []).filter((item) => item.read === false).length

    return NextResponse.json({ success: true, data: data || [], unreadCount })
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
