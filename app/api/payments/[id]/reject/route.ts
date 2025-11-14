import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { rejectPayment } from '@/lib/payments/verification'

/**
 * Reject a payment
 * Used by managers to reject pending payments
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paymentId = params.id

    if (!paymentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'payment id is required',
        },
        { status: 400 }
      )
    }

    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Check permission (manager or admin)
    const canVerify = await hasPermission(userId, 'payment:verify')
    if (!canVerify) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to reject payments',
        },
        { status: 403 }
      )
    }

    // 3. Parse request body
    let body: { reason: string; notes?: string }
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

    // 4. Validate required fields
    if (!body.reason || body.reason.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'rejection reason is required',
        },
        { status: 400 }
      )
    }

    // 5. Reject payment
    const result = await rejectPayment(paymentId, userId, {
      reason: body.reason.trim(),
      notes: body.notes?.trim(),
    })

    if (!result.success) {
      // Determine status code
      let statusCode = 400
      if (result.error?.includes('not found')) {
        statusCode = 404
      } else if (result.error?.includes('already') || result.error?.includes('Cannot reject')) {
        statusCode = 409 // Conflict
      } else if (result.error?.includes('Failed')) {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }

    // 6. Return success response
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const err = error as Error
    console.error('Error in reject payment endpoint:', err)

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
      error: 'Method not allowed. Use POST to reject a payment.',
    },
    { status: 405 }
  )
}

