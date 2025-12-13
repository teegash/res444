import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { approvePayment, rejectPayment } from '@/lib/payments/verification'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Resolve payment id from params, query, or body (defensive)
    const paymentIdFromParams = params?.id || null
    const paymentIdFromQuery =
      request.nextUrl.searchParams.get('paymentId') ||
      request.nextUrl.searchParams.get('id') ||
      null

    // Parse body once (used for action too)
    const body = await request.json().catch(() => ({}))
    const paymentIdFromBody = body?.payment_id || body?.id || null

    // Fallback: parse from pathname last segment (in case params not injected)
    const segments = request.nextUrl.pathname.split('/').filter(Boolean)
    const paymentIdFromPath = segments[segments.length - 1] || null

    const paymentId = paymentIdFromParams || paymentIdFromQuery || paymentIdFromBody || paymentIdFromPath

    if (!paymentId) {
      console.error('[ManagerPaymentAction] Missing payment id', {
        paymentIdFromParams,
        paymentIdFromQuery,
        paymentIdFromBody,
        paymentIdFromPath,
        path: request.nextUrl.pathname,
      })
      return NextResponse.json({ success: false, error: 'Payment id is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json(
        { success: false, error: 'Server misconfigured: Admin client unavailable.' },
        { status: 500 }
      )
    }
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
      .select('role, organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const orgId = membership?.organization_id || null
    role = membership?.role || (user.user_metadata as any)?.role || (user as any)?.role || null

    if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
    }

    const { data: paymentRow, error: paymentFetchError } = await adminSupabase
      .from('payments')
      .select('organization_id')
      .eq('id', paymentId)
      .maybeSingle()

    if (paymentFetchError || !paymentRow) {
      return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 })
    }
    if (paymentRow.organization_id !== orgId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

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
