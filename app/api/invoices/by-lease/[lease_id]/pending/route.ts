import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/rbac/routeGuards'

export async function GET(
  request: NextRequest,
  { params }: { params: { lease_id: string } }
) {
  try {
    const leaseId = params.lease_id

    if (!leaseId) {
      return NextResponse.json(
        {
          success: false,
          error: 'lease_id is required',
        },
        { status: 400 }
      )
    }

    // Authenticate user
    const { userId } = await requireAuth()

    const supabase = await createClient()

    // Verify user has access to this lease
    const { data: lease, error: leaseError } = await supabase
      .from('leases')
      .select('id, tenant_user_id')
      .eq('id', leaseId)
      .single()

    if (leaseError || !lease) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lease not found',
        },
        { status: 404 }
      )
    }

    // Check if user is tenant or has permission
    const isTenant = lease.tenant_user_id === userId
    const { hasPermission } = await import('@/lib/rbac/permissions')
    const canView = isTenant || (await hasPermission(userId, 'invoice:view_all'))

    if (!canView) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to view these invoices',
        },
        { status: 403 }
      )
    }

    // Get pending invoices for this lease
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('lease_id', leaseId)
      .eq('status', false)
      .order('due_date', { ascending: true })

    if (invoicesError) {
      console.error('Error fetching pending invoices:', invoicesError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch pending invoices',
        },
        { status: 500 }
      )
    }

    // Calculate total pending amount
    const totalPending = (invoices || []).reduce((sum, invoice) => {
      // Get total paid for this invoice
      return sum + parseFloat(invoice.amount.toString())
    }, 0)

    // Get total paid for all invoices
    const invoiceIds = (invoices || []).map((inv) => inv.id)
    let totalPaid = 0

    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('invoice_id, amount_paid')
        .in('invoice_id', invoiceIds)
        .eq('verified', true)

      totalPaid = (payments || []).reduce(
        (sum, payment) => sum + parseFloat(payment.amount_paid.toString()),
        0
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        invoices: invoices || [],
        total_pending: totalPending,
        total_paid: totalPaid,
        outstanding: totalPending - totalPaid,
        count: (invoices || []).length,
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error in pending invoices endpoint:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  }
}
