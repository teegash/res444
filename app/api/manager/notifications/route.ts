import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

function parseDateOnly(value?: string | null) {
  if (!value) return null
  const raw = value.trim()
  const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
  const [y, m, d] = base.split('-').map((part) => Number(part))
  if (y && m && d) {
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function summarizeLeaseState(
  lease: any,
  renewalStartDate: Date | null,
  hasCompletedRenewal: boolean
) {
  if (!lease) {
    return {
      status: 'unassigned',
      detail: 'Lease has not been assigned.',
    }
  }

  const today = new Date()
  const start = lease.start_date ? new Date(lease.start_date) : null
  const end = lease.end_date ? new Date(lease.end_date) : null

  if (hasCompletedRenewal && renewalStartDate && renewalStartDate > today) {
    return {
      status: 'renewed',
      detail: `Renewed lease starts on ${renewalStartDate.toLocaleDateString()}.`,
    }
  }

  if (start && start <= today) {
    if (!end) {
      return {
        status: 'invalid',
        detail: 'Lease end date is missing and must be configured.',
      }
    }
    if (end >= today) {
      return {
        status: 'valid',
        detail: 'Lease is currently active.',
      }
    }
  }

  if (end && end < today) {
    return {
      status: 'expired',
      detail: `Lease ended on ${end.toLocaleDateString()}.`,
    }
  }

  if (start && start > today) {
    const leaseStatus = (lease.status || '').toLowerCase()
    if (leaseStatus === 'renewed' || hasCompletedRenewal) {
      return {
        status: 'renewed',
        detail: `Renewed lease starts on ${start.toLocaleDateString()}.`,
      }
    }
    return {
      status: 'pending',
      detail: `Lease becomes active on ${start.toLocaleDateString()}.`,
    }
  }

  return {
    status: lease.status || 'pending',
    detail: 'Lease status pending verification.',
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
    if (!role || !MANAGER_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 })
    }

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

      const leaseIds = Array.from(
        new Set(Array.from(leaseMap.values()).map((lease: any) => lease?.id).filter(Boolean) as string[])
      )

      const completedRenewalLeaseIds = new Set<string>()
      const completedRenewalStartMap = new Map<string, string | null>()
      if (leaseIds.length > 0) {
        const { data: completedRenewals } = await adminSupabase
          .from('lease_renewals')
          .select('lease_id, proposed_start_date, created_at')
          .eq('organization_id', orgId)
          .in('lease_id', leaseIds)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })

        for (const renewal of completedRenewals || []) {
          if (!renewal?.lease_id) continue
          completedRenewalLeaseIds.add(renewal.lease_id)
          if (!completedRenewalStartMap.has(renewal.lease_id)) {
            completedRenewalStartMap.set(renewal.lease_id, renewal.proposed_start_date || null)
          }
        }
      }

      const expiredLeases = Array.from(leaseMap.entries())
        .map(([tenantId, lease]) => {
          const hasCompletedRenewal = lease?.id ? completedRenewalLeaseIds.has(lease.id) : false
          const renewalStartRaw =
            hasCompletedRenewal && lease?.id ? completedRenewalStartMap.get(lease.id) ?? null : null
          const renewalStartParsed = renewalStartRaw ? parseDateOnly(renewalStartRaw) : null
          const leaseEndParsed = hasCompletedRenewal && lease?.end_date ? parseDateOnly(lease.end_date) : null
          const renewalStartFallback =
            hasCompletedRenewal && !renewalStartParsed && leaseEndParsed ? addDaysUtc(leaseEndParsed, 1) : null
          const renewalStartDate = renewalStartParsed || renewalStartFallback
          const leaseSummary = summarizeLeaseState(lease, renewalStartDate, hasCompletedRenewal)
          if (leaseSummary.status !== 'expired') return null
          return {
            lease,
            tenantId,
          }
        })
        .filter(Boolean) as Array<{ lease: any; tenantId: string }>

      const expiredLeaseIds = new Set<string>(
        expiredLeases.map((entry) => entry.lease?.id).filter(Boolean)
      )

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

        const rowsToInsert = expiredLeases.flatMap((entry) => {
          const lease = entry.lease
          if (!lease?.id) return []
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
      .limit(50)

    if (error) {
      throw error
    }

    let rows = data || []
    try {
      const { data: leaseExpiredRows } = await adminSupabase
        .from('communications')
        .select('id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, related_entity_id, message_type')
        .eq('recipient_user_id', user.id)
        .eq('organization_id', orgId)
        .eq('related_entity_type', 'lease_expired')
        .eq('read', false)

      if (leaseExpiredRows?.length) {
        const byId = new Map<string, any>()
        rows.forEach((row) => byId.set(row.id, row))
        leaseExpiredRows.forEach((row: any) => byId.set(row.id, row))
        rows = Array.from(byId.values()).sort((a, b) => {
          const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0
          return bTime - aTime
        })
      }
    } catch (mergeError) {
      console.error('[ManagerNotifications.GET] Lease-expired merge failed', mergeError)
    }

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
