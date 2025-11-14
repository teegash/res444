/**
 * Export utilities for CSV and PDF generation
 */

export interface CSVExportOptions {
  filename?: string
  headers: string[]
  rows: (string | number)[][]
}

/**
 * Generate CSV content from data
 */
export function generateCSV(options: CSVExportOptions): string {
  const { headers, rows } = options

  // Escape CSV values
  const escapeCSV = (value: string | number): string => {
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // Build CSV
  const lines: string[] = []

  // Headers
  lines.push(headers.map(escapeCSV).join(','))

  // Rows
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','))
  }

  return lines.join('\n')
}

/**
 * Format currency for CSV
 */
export function formatCurrencyForCSV(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format percentage for CSV
 */
export function formatPercentageForCSV(value: number): string {
  return `${value.toFixed(2)}%`
}

/**
 * Generate CSV for monthly report
 */
export function generateMonthlyReportCSV(data: any): string {
  const headers = [
    'Month',
    'Rent Revenue (KES)',
    'Water Revenue (KES)',
    'Total Revenue (KES)',
    'Paid (KES)',
    'Outstanding (KES)',
  ]

  const rows = data.monthlyBreakdown.map((month: any) => [
    month.month,
    month.rent,
    month.water,
    month.total,
    month.paid,
    month.outstanding,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for financial report
 */
export function generateFinancialReportCSV(data: any): string {
  const headers = [
    'Date',
    'Income (KES)',
    'Expenses (KES)',
    'Net (KES)',
  ]

  const rows = data.cashFlow.map((flow: any) => [
    flow.date,
    flow.income,
    flow.expenses,
    flow.net,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for occupancy report
 */
export function generateOccupancyReportCSV(data: any): string {
  const headers = [
    'Building Name',
    'Total Units',
    'Occupied',
    'Vacant',
    'Occupancy Rate (%)',
  ]

  const rows = data.byBuilding.map((building: any) => [
    building.buildingName,
    building.totalUnits,
    building.occupied,
    building.vacant,
    building.occupancyRate,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for revenue report
 */
export function generateRevenueReportCSV(data: any): string {
  const headers = [
    'Building Name',
    'Revenue (KES)',
    'Units',
    'Revenue per Unit (KES)',
  ]

  const rows = data.byBuilding.map((building: any) => [
    building.buildingName,
    building.revenue,
    building.units,
    building.revenuePerUnit,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for utility report
 */
export function generateUtilityReportCSV(data: any): string {
  const headers = [
    'Unit Number',
    'Building Name',
    'Total Bills',
    'Total Amount (KES)',
    'Average Usage',
  ]

  const rows = data.byUnit.map((unit: any) => [
    unit.unitNumber,
    unit.buildingName,
    unit.totalBills,
    unit.totalAmount,
    unit.averageUsage,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for performance report
 */
export function generatePerformanceReportCSV(data: any): string {
  const headers = [
    'Tenant Name',
    'Unit Number',
    'Total Invoices',
    'Paid Invoices',
    'Late Payments',
    'On-Time Payments',
    'Reliability Score (%)',
    'Average Delay (Days)',
  ]

  const rows = data.tenantReliability.map((tenant: any) => [
    tenant.tenantName,
    tenant.unitNumber,
    tenant.totalInvoices,
    tenant.paidInvoices,
    tenant.latePayments,
    tenant.onTimePayments,
    tenant.reliabilityScore,
    tenant.averageDelayDays,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate CSV for rent collection report
 */
export function generateRentCollectionReportCSV(data: any): string {
  const headers = [
    'Month',
    'Invoiced (KES)',
    'Collected (KES)',
    'Outstanding (KES)',
    'Collection Rate (%)',
  ]

  const rows = data.byMonth.map((month: any) => [
    month.month,
    month.invoiced,
    month.collected,
    month.outstanding,
    month.rate,
  ])

  return generateCSV({ headers, rows })
}

/**
 * Generate PDF content (placeholder - would need a PDF library like pdfkit or puppeteer)
 * For now, returns HTML that can be converted to PDF
 */
export function generatePDFHTML(data: any, reportType: string): string {
  const title = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report'
  const period = `${data.period?.start || 'N/A'} to ${data.period?.end || 'N/A'}`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      color: #333;
    }
    h1 {
      color: #27AE60;
      border-bottom: 2px solid #27AE60;
      padding-bottom: 10px;
    }
    .period {
      color: #666;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #27AE60;
      color: white;
    }
    tr:nth-child(even) {
      background-color: #f2f2f2;
    }
    .summary {
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .metric {
      display: inline-block;
      margin: 10px 20px 10px 0;
    }
    .metric-label {
      font-weight: bold;
      color: #666;
    }
    .metric-value {
      font-size: 24px;
      color: #27AE60;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="period">Period: ${period}</div>
  <div class="summary">
    <h2>Summary</h2>
    ${generateSummaryHTML(data, reportType)}
  </div>
  ${generateDetailsHTML(data, reportType)}
  <div style="margin-top: 40px; text-align: center; color: #666; font-size: 12px;">
    Generated on ${new Date().toLocaleString('en-KE')}
  </div>
</body>
</html>
  `
}

function generateSummaryHTML(data: any, reportType: string): string {
  switch (reportType) {
    case 'monthly':
      return `
        <div class="metric">
          <div class="metric-label">Total Revenue</div>
          <div class="metric-value">KES ${data.summary?.totalRevenue?.toLocaleString() || 0}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Collection Rate</div>
          <div class="metric-value">${data.summary?.collectionRate?.toFixed(2) || 0}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">Occupancy Rate</div>
          <div class="metric-value">${data.summary?.occupancyRate?.toFixed(2) || 0}%</div>
        </div>
      `
    case 'financial':
      return `
        <div class="metric">
          <div class="metric-label">Total Revenue</div>
          <div class="metric-value">KES ${data.revenue?.totalRevenue?.toLocaleString() || 0}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Outstanding</div>
          <div class="metric-value">KES ${data.outstanding?.total?.toLocaleString() || 0}</div>
        </div>
      `
    case 'occupancy':
      return `
        <div class="metric">
          <div class="metric-label">Total Units</div>
          <div class="metric-value">${data.totalUnits || 0}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Occupied</div>
          <div class="metric-value">${data.occupancy?.occupiedUnits || 0}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Occupancy Rate</div>
          <div class="metric-value">${data.occupancy?.occupancyRate?.toFixed(2) || 0}%</div>
        </div>
      `
    default:
      return ''
  }
}

function generateDetailsHTML(data: any, reportType: string): string {
  // This would generate detailed tables based on report type
  // For now, return a placeholder
  return '<p>Detailed data tables would be generated here based on report type.</p>'
}

