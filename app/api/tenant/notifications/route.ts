import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    try {
      const { data: lease } = await adminSupabase
        .from('leases')
        .select('id, organization_id, end_date')
        .eq('tenant_user_id', user.id)
        .not('end_date', 'is', null)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const leaseEnd = lease?.end_date ? new Date(lease.end_date) : null
      const leaseExpired =
        leaseEnd && !Number.isNaN(leaseEnd.getTime())
          ? new Date(
              leaseEnd.getFullYear(),
              leaseEnd.getMonth(),
              leaseEnd.getDate()
            ) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
          : false

      if (leaseExpired && lease?.id) {
        const { data: existing } = await adminSupabase
          .from('communications')
          .select('id, read')
          .eq('recipient_user_id', user.id)
          .eq('related_entity_type', 'lease_expired')
          .eq('related_entity_id', lease.id)
          .maybeSingle()

        if (!existing) {
          const endLabel = leaseEnd
            ? leaseEnd.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'Unknown'
          await adminSupabase.from('communications').insert({
            sender_user_id: user.id,
            recipient_user_id: user.id,
            related_entity_type: 'lease_expired',
            related_entity_id: lease.id,
            message_text: `Your lease expired on ${endLabel}. Please renew to avoid interruptions.`,
            message_type: 'in_app',
            read: false,
            organization_id: lease.organization_id,
          })
        } else if (existing.read) {
          await adminSupabase.from('communications').update({ read: false }).eq('id', existing.id)
        }
      } else {
        await adminSupabase
          .from('communications')
          .update({ read: true })
          .eq('recipient_user_id', user.id)
          .eq('related_entity_type', 'lease_expired')
      }
    } catch (notifyError) {
      console.error('[TenantNotifications.GET] Lease-expired notification sync failed', notifyError)
    }

    const { data, error } = await adminSupabase
      .from('communications')
      .select(
        'id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, related_entity_id, message_type'
      )
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      throw error
    }

    const unreadCount = (data || []).filter((item) => item.read === false).length

    return NextResponse.json({ success: true, data: data || [], unreadCount })
  } catch (error) {
    console.error('[TenantNotifications.GET] Failed to fetch notifications', error)
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
    const { error } = await adminSupabase
      .from('communications')
      .update({ read: true })
      .in('id', ids)
      .eq('recipient_user_id', user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TenantNotifications.PATCH] Failed to mark notifications read', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update notifications.',
      },
      { status: 500 }
    )
  }
}
