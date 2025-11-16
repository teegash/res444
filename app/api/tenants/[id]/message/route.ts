import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: {
    id: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { message, lease_id } = body || {}

    if (!message || !message.toString().trim()) {
      return NextResponse.json(
        { success: false, error: 'Message text is required.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()

    const insertPayload: Record<string, any> = {
      sender_user_id: user.id,
      recipient_user_id: tenantId,
      message_text: message.toString().trim(),
      message_type: 'in_app',
      read: false,
    }

    if (lease_id) {
      insertPayload.related_entity_type = 'lease'
      insertPayload.related_entity_id = lease_id
    }

    const { data, error: insertError } = await adminSupabase
      .from('communications')
      .insert(insertPayload)
      .select('id, sender_user_id, recipient_user_id, message_text, created_at, read')
      .single()

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[Tenants.Message] Failed to send tenant message', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send message.' },
      { status: 500 }
    )
  }
}
