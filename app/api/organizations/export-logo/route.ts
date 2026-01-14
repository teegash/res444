import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PUT(request: NextRequest) {
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
    const exportLogoUrl =
      typeof body?.export_logo_url === 'string' ? body.export_logo_url.trim() : ''

    if (!exportLogoUrl) {
      return NextResponse.json({ success: false, error: 'export_logo_url is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: membership, error: memberErr } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (memberErr) {
      return NextResponse.json({ success: false, error: memberErr.message }, { status: 400 })
    }
    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    if (membership.role !== 'admin' && membership.role !== 'manager') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error: updErr } = await admin
      .from('organizations')
      .update({ export_logo_url: exportLogoUrl, updated_at: new Date().toISOString() })
      .eq('id', membership.organization_id)
      .select('id, export_logo_url')
      .single()

    if (updErr) {
      return NextResponse.json({ success: false, error: updErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[Organizations.ExportLogo.PUT] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update export logo' },
      { status: 500 }
    )
  }
}
