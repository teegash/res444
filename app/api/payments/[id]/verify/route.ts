import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { approvePayment } from '@/lib/payments/verification'

/**
 * Approve/verify a payment
 * Used by managers to verify pending payments
 */
export async function PUT(
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
          error: 'You do not have permission to verify payments',
        },
        { status: 403 }
      )
    }

    // 3. Parse request body
    let body: { notes?: string } = {}
    try {
      const contentType = request.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        body = await request.json()
      }
    } catch (error) {
      // Body is optional, continue without it
    }

    // 4. Approve payment
    const result = await approvePayment(paymentId, userId, body)

    if (!result.success) {
      // Determine status code
      let statusCode = 400
      if (result.error?.includes('not found')) {
        statusCode = 404
      } else if (result.error?.includes('already')) {
        statusCode = 409 // Conflict
      } else if (result.error?.includes('Failed')) {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }

    // 5. Return success response
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const err = error as Error
    console.error('Error in approve payment endpoint:', err)

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
      error: 'Method not allowed. Use PUT to approve a payment.',
    },
    { status: 405 }
  )
}

