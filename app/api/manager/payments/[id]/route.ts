import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { approvePayment, rejectPayment } from '@/lib/payments/verification'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const paymentId = params?.id
  if (!paymentId) {
    return NextResponse.json({ success: false, error: 'Payment id is required.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Prefer membership/profile role over metadata
    let role: string | null = null
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    role = membership?.role || (user.user_metadata as any)?.role || (user as any)?.role || null

    if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action
    if (action === 'approve') {
      const result = await approvePayment(paymentId, user.id, { notes: body?.notes })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Failed to approve payment.' }, { status: 400 })
      }
      return NextResponse.json({ success: true, data: result.data, message: result.message || 'Payment verified.' })
    }
    if (action === 'reject') {
      const reason = body?.reason || 'Payment rejected'
      const result = await rejectPayment(paymentId, user.id, { reason, notes: body?.notes })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Failed to reject payment.' }, { status: 400 })
      }
      return NextResponse.json({ success: true, data: result.data, message: result.message || 'Payment rejected.' })
    }

    return NextResponse.json({ success: false, error: 'Invalid action. Use approve or reject.' }, { status: 400 })
  } catch (error) {
    console.error('[ManagerPaymentAction] failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process payment.' },
      { status: 500 }
    )
  }
}
