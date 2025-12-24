import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { enabled } = (await request.json().catch(() => null)) || {}
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Missing auto-renew state.' }, { status: 400 })
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
      .select('id')
      .eq('tenant_user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) {
      throw leaseError
    }

    if (!lease) {
      return NextResponse.json({ success: false, error: 'No active lease found.' }, { status: 404 })
    }

    const { error: updateError } = await adminSupabase
      .from('leases')
      .update({ lease_auto_generated: enabled, updated_at: new Date().toISOString() })
      .eq('id', lease.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, data: { leaseId: lease.id, lease_auto_generated: enabled } })
  } catch (error) {
    console.error('[TenantLeaseAutoRenew] Failed to update auto-renew', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update auto-renew preference.',
      },
      { status: 500 }
    )
  }
}
