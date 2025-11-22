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
    const { data, error } = await adminSupabase
      .from('communications')
      .select(
        'id, sender_user_id, recipient_user_id, message_text, read, created_at, related_entity_type, related_entity_id, message_type'
      )
      .eq('recipient_user_id', user.id)
      .order('created_at', { descending: true })
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
