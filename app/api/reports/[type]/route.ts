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
import {
  generateMonthlyReportCSV,
  generateFinancialReportCSV,
  generateOccupancyReportCSV,
  generateRevenueReportCSV,
  generateUtilityReportCSV,
  generatePerformanceReportCSV,
  generateRentCollectionReportCSV,
  generatePDFHTML,
} from '@/lib/reports/exports'
import { createClient } from '@/lib/supabase/server'

/**
 * Dynamic reports API endpoint
 * Supports: monthly, financial, occupancy, revenue, utility, performance, rent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
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
    const format = (searchParams.get('format') || 'json') as 'json' | 'csv' | 'pdf'

    // 5. Generate report based on type
    let reportData: any

    switch (reportType) {
      case 'monthly':
        reportData = await generateMonthlyReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'financial':
        reportData = await generateFinancialReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'occupancy':
        reportData = await generateOccupancyReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'revenue':
        reportData = await generateRevenueReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'utility':
        reportData = await generateUtilityReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'performance':
        reportData = await generatePerformanceReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      case 'rent':
        reportData = await generateRentCollectionReport({
          organizationId,
          startDate,
          endDate,
          buildingId,
          format,
        })
        break

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid report type',
          },
          { status: 400 }
        )
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
      // Log but don't fail the request
      console.error('Error saving report to database:', error)
    }

    // 7. Format response based on requested format
    if (format === 'csv') {
      let csvContent: string

      switch (reportType) {
        case 'monthly':
          csvContent = generateMonthlyReportCSV(reportData)
          break
        case 'financial':
          csvContent = generateFinancialReportCSV(reportData)
          break
        case 'occupancy':
          csvContent = generateOccupancyReportCSV(reportData)
          break
        case 'revenue':
          csvContent = generateRevenueReportCSV(reportData)
          break
        case 'utility':
          csvContent = generateUtilityReportCSV(reportData)
          break
        case 'performance':
          csvContent = generatePerformanceReportCSV(reportData)
          break
        case 'rent':
          csvContent = generateRentCollectionReportCSV(reportData)
          break
        default:
          csvContent = ''
      }

      const filename = `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } else if (format === 'pdf') {
      const htmlContent = generatePDFHTML(reportData, reportType)
      const filename = `${reportType}_report_${new Date().toISOString().split('T')[0]}.html`

      // Note: For actual PDF generation, you would use a library like puppeteer or pdfkit
      // For now, return HTML that can be converted to PDF client-side or via a service
      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } else {
      // JSON format (default)
      return NextResponse.json(
        {
          success: true,
          report_type: reportType,
          data: reportData,
          generated_at: new Date().toISOString(),
        },
        { status: 200 }
      )
    }
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

// Handle unsupported methods
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use GET to retrieve reports.',
    },
    { status: 405 }
  )
}

