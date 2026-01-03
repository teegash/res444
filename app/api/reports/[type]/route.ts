import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { getUserRole } from '@/lib/rbac/userRole'
import {
  generateMonthlyReport,
  generateFinancialReport,
  generateOccupancyReport,
  generateRevenueReport,
  generateUtilityReport,
  generatePerformanceReport,
  generateRentCollectionReport,
  ReportType,
} from '@/lib/reports/generators'
import { createClient } from '@/lib/supabase/server'

// NOTE: CSV/PDF generation is handled client-side via the unified export layer
// (lib/export/download.ts) to keep styling consistent across the system.

/**
 * Dynamic reports API endpoint
 * Supports: monthly, financial, occupancy, revenue, utility, performance, rent
 */
export async function GET(request: NextRequest, { params }: { params: { type: string } }) {
  try {
    const reportType = params.type as ReportType

    // 1. Validate report type
    const validTypes: ReportType[] = [
      'monthly',
      'financial',
      'occupancy',
      'revenue',
      'utility',
      'performance',
      'rent',
    ]

    if (!validTypes.includes(reportType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid report type. Valid types: ${validTypes.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // 2. Authenticate user
    const { userId } = await requireAuth()

    // 3. Get user's organization
    const userRole = await getUserRole(userId)
    if (!userRole || !userRole.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'User is not associated with an organization',
        },
        { status: 403 }
      )
    }

    const organizationId = userRole.organization_id

    // 4. Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date') || undefined
    const endDate = searchParams.get('end_date') || undefined
    const buildingId = searchParams.get('building_id') || undefined

    const requestedFormat = (searchParams.get('format') || 'json').toLowerCase()
    if (requestedFormat !== 'json') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unsupported format. Use format=json and export via the dashboard export buttons (PDF/Excel/CSV) for consistent styling.',
        },
        { status: 400 }
      )
    }

    const format: 'json' = 'json'

    // 5. Generate report based on type
    let reportData: any

    switch (reportType) {
      case 'monthly':
        reportData = await generateMonthlyReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'financial':
        reportData = await generateFinancialReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'occupancy':
        reportData = await generateOccupancyReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'revenue':
        reportData = await generateRevenueReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'utility':
        reportData = await generateUtilityReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'performance':
        reportData = await generatePerformanceReport({ organizationId, startDate, endDate, buildingId, format })
        break
      case 'rent':
        reportData = await generateRentCollectionReport({ organizationId, startDate, endDate, buildingId, format })
        break
      default:
        return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    }

    // 6. Save report to database (optional)
    try {
      const supabase = await createClient()
      await supabase.from('reports').insert({
        organization_id: organizationId,
        report_type: reportType,
        report_period_start: reportData.period?.start || new Date().toISOString().split('T')[0],
        report_period_end: reportData.period?.end || new Date().toISOString().split('T')[0],
        data_json: reportData,
        created_by: userId,
      })
    } catch (error) {
      console.error('Error saving report to database:', error)
    }

    // 7. JSON response (exports are generated client-side via lib/export/download.ts)
    return NextResponse.json(
      {
        success: true,
        report_type: reportType,
        data: reportData,
        generated_at: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Error generating report:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred while generating the report',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      },
      { status: 500 }
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. Use GET to retrieve reports.' },
    { status: 405 }
  )
}
