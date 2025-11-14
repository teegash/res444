import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTenantWithLease, CreateTenantWithLeaseRequest } from '@/lib/tenants/leaseCreation'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Check permission
    const canCreate = await hasPermission(userId, 'tenant:create')
    if (!canCreate) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to create tenants',
        },
        { status: 403 }
      )
    }

    // 3. Parse request body
    let body: CreateTenantWithLeaseRequest
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
    if (!body.unit_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'unit_id is required',
        },
        { status: 400 }
      )
    }

    if (!body.tenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'tenant data is required',
        },
        { status: 400 }
      )
    }

    if (!body.lease) {
      return NextResponse.json(
        {
          success: false,
          error: 'lease data is required',
        },
        { status: 400 }
      )
    }

    // 5. Call tenant creation function
    const result = await createTenantWithLease(body, userId)

    // 6. Return appropriate status code
    if (result.success) {
      return NextResponse.json(result, { status: 201 })
    } else {
      // Determine status code based on error type
      let statusCode = 400

      if (result.error?.includes('permission') || result.error?.includes('do not have')) {
        statusCode = 403
      } else if (result.error?.includes('not found')) {
        statusCode = 404
      } else if (result.error?.includes('occupied')) {
        statusCode = 409 // Conflict
      } else if (result.error?.includes('already') || result.error?.includes('exists')) {
        statusCode = 409 // Conflict
      } else if (result.error?.includes('Database') || result.error?.includes('transaction')) {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in create-with-lease endpoint:', err)

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
      error: 'Method not allowed. Use POST to create a tenant with lease.',
    },
    { status: 405 }
  )
}

