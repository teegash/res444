import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { updateInvoiceStatus, calculateInvoiceStatus } from '@/lib/invoices/invoiceGeneration'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id

    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'invoice id is required',
        },
        { status: 400 }
      )
    }

    // Authenticate user
    const { userId } = await requireAuth()

    // Check permission
    const canUpdate = await hasPermission(userId, 'invoice:edit')
    if (!canUpdate) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to update invoices',
        },
        { status: 403 }
      )
    }

    // Parse request body
    let body: { payment_date?: string; notes?: string }
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get invoice to verify it exists
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, amount, lease_id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invoice not found',
        },
        { status: 404 }
      )
    }

    // Calculate new status based on payments
    const newStatus = await calculateInvoiceStatus(invoiceId)

    // Update invoice
    const updateData: {
      status: string
      payment_date?: string
      updated_at: string
    } = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    if (body.payment_date) {
      updateData.payment_date = body.payment_date
    } else if (newStatus === 'paid') {
      // Auto-set payment date if marked as paid
      updateData.payment_date = new Date().toISOString().split('T')[0]
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)

    if (updateError) {
      console.error('Error updating invoice:', updateError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update invoice',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice status updated successfully',
      data: {
        invoice_id: invoiceId,
        status: newStatus,
        payment_date: updateData.payment_date,
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error in mark-paid endpoint:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use PUT to mark invoice as paid.',
    },
    { status: 405 }
  )
}

