import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBulkUnits, BulkCreateRequest } from '@/lib/properties/bulkUnitCreation'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const buildingId = params.id

    if (!buildingId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Building ID is required',
        },
        { status: 400 }
      )
    }

    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. Please sign in.',
        },
        { status: 401 }
      )
    }

    // Parse request body
    let body: BulkCreateRequest
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

    // Validate request body structure
    if (!body.units || !Array.isArray(body.units) || body.units.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Request must include a non-empty "units" array',
        },
        { status: 400 }
      )
    }

    // Validate total units count (safety limit)
    const totalUnits = body.units.reduce((sum, group) => sum + group.count, 0)
    if (totalUnits > 1000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot create more than 1000 units in a single operation',
        },
        { status: 400 }
      )
    }

    // Call bulk creation function
    const result = await createBulkUnits(buildingId, user.id, body)

    // Return appropriate status code
    if (result.success) {
      return NextResponse.json(result, { status: 201 })
    } else {
      // Determine status code based on error type
      let statusCode = 400

      if (result.error?.includes('permission')) {
        statusCode = 403
      } else if (result.error?.includes('not found')) {
        statusCode = 404
      } else if (result.error?.includes('Database') || result.error?.includes('transaction')) {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in bulk-create endpoint:', err)

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
      error: 'Method not allowed. Use POST to create bulk units.',
    },
    { status: 405 }
  )
}

