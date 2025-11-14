/**
 * Example usage of the reporting system
 */

// Example 1: Get monthly report (JSON)
export async function getMonthlyReport() {
  const response = await fetch(
    '/api/reports/monthly?start_date=2024-01-01&end_date=2024-12-31',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  const result = await response.json()

  if (result.success) {
    console.log('Monthly Report:', result.data)
    // {
    //   period: { start: "2024-01-01", end: "2024-12-31" },
    //   revenue: { totalRevenue: 1000000, collectionRate: 85.5, ... },
    //   occupancy: { totalUnits: 50, occupiedUnits: 40, occupancyRate: 80, ... },
    //   payments: { totalPayments: 200, onTimePayments: 170, ... },
    //   water: { totalWaterBills: 50, totalWaterAmount: 50000, ... },
    //   monthlyBreakdown: [...],
    //   summary: { totalRevenue: 1000000, collectionRate: 85.5, ... }
    // }
  }

  return result
}

// Example 2: Get financial report (CSV export)
export async function downloadFinancialReportCSV() {
  const response = await fetch(
    '/api/reports/financial?start_date=2024-01-01&end_date=2024-12-31&format=csv',
    {
      method: 'GET',
    }
  )

  if (response.ok) {
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'financial_report.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }
}

// Example 3: Get occupancy report
export async function getOccupancyReport() {
  const response = await fetch('/api/reports/occupancy', {
    method: 'GET',
  })

  const result = await response.json()

  if (result.success) {
    console.log('Occupancy Report:', result.data)
    // {
    //   totalUnits: 50,
    //   occupancy: { totalUnits: 50, occupiedUnits: 40, ... },
    //   byBuilding: [
    //     { buildingId: "uuid", buildingName: "Alpha Complex", totalUnits: 30, occupied: 25, ... },
    //     ...
    //   ],
    //   leaseExpirations: [
    //     { leaseId: "uuid", tenantName: "John Doe", unitNumber: "101", endDate: "2024-12-31", daysUntilExpiry: 30 },
    //     ...
    //   ]
    // }
  }

  return result
}

// Example 4: Get revenue report with building filter
export async function getRevenueReportForBuilding(buildingId: string) {
  const response = await fetch(
    `/api/reports/revenue?building_id=${buildingId}&start_date=2024-01-01&end_date=2024-12-31`,
    {
      method: 'GET',
    }
  )

  const result = await response.json()
  return result
}

// Example 5: Get utility report (water usage)
export async function getUtilityReport() {
  const response = await fetch(
    '/api/reports/utility?start_date=2024-01-01&end_date=2024-12-31',
    {
      method: 'GET',
    }
  )

  const result = await response.json()

  if (result.success) {
    console.log('Utility Report:', result.data)
    // {
    //   period: { start: "2024-01-01", end: "2024-12-31" },
    //   water: { totalWaterBills: 50, totalWaterAmount: 50000, averageUsagePerUnit: 100, ... },
    //   byBuilding: [...],
    //   byUnit: [...]
    // }
  }

  return result
}

// Example 6: Get performance report
export async function getPerformanceReport() {
  const response = await fetch(
    '/api/reports/performance?start_date=2024-01-01&end_date=2024-12-31',
    {
      method: 'GET',
    }
  )

  const result = await response.json()

  if (result.success) {
    console.log('Performance Report:', result.data)
    // {
    //   period: { start: "2024-01-01", end: "2024-12-31" },
    //   collection: { rate: 85.5, onTime: 170, late: 30, averageDelay: 5.2 },
    //   tenantReliability: [
    //     { tenantId: "uuid", tenantName: "John Doe", reliabilityScore: 95, ... },
    //     ...
    //   ],
    //   topPerformers: [...],
    //   issues: [...]
    // }
  }

  return result
}

// Example 7: Get rent collection report
export async function getRentCollectionReport() {
  const response = await fetch(
    '/api/reports/rent?start_date=2024-01-01&end_date=2024-12-31',
    {
      method: 'GET',
    }
  )

  const result = await response.json()

  if (result.success) {
    console.log('Rent Collection Report:', result.data)
    // {
    //   period: { start: "2024-01-01", end: "2024-12-31" },
    //   collection: { totalInvoiced: 1000000, totalCollected: 855000, outstanding: 145000, collectionRate: 85.5 },
    //   byMonth: [...],
    //   overdue: [
    //     { invoiceId: "uuid", tenantName: "John Doe", unitNumber: "101", amount: 10000, daysOverdue: 15 },
    //     ...
    //   ]
    // }
  }

  return result
}

// Example 8: React component for report download
export const ReportDownloadComponent = `
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

export function ReportDownloader() {
  const [reportType, setReportType] = useState('monthly')
  const [format, setFormat] = useState('json')
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const url = \`/api/reports/\${reportType}?format=\${format}&start_date=2024-01-01&end_date=2024-12-31\`
      const response = await fetch(url)

      if (format === 'csv' || format === 'pdf') {
        const blob = await response.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = \`\${reportType}_report.\${format === 'csv' ? 'csv' : 'html'}\`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(downloadUrl)
        document.body.removeChild(a)
      } else {
        const data = await response.json()
        console.log('Report data:', data)
      }
    } catch (error) {
      console.error('Error downloading report:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Select value={reportType} onValueChange={setReportType}>
        <option value="monthly">Monthly Report</option>
        <option value="financial">Financial Report</option>
        <option value="occupancy">Occupancy Report</option>
        <option value="revenue">Revenue Report</option>
        <option value="utility">Utility Report</option>
        <option value="performance">Performance Report</option>
        <option value="rent">Rent Collection Report</option>
      </Select>

      <Select value={format} onValueChange={setFormat}>
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
        <option value="pdf">PDF</option>
      </Select>

      <Button onClick={handleDownload} disabled={loading}>
        {loading ? 'Generating...' : 'Download Report'}
      </Button>
    </div>
  )
}
`

// Example 9: All available report types
export const reportTypes = {
  monthly: {
    name: 'Monthly Report',
    description: 'Comprehensive monthly overview with all metrics',
    endpoint: '/api/reports/monthly',
    includes: [
      'Revenue metrics',
      'Occupancy metrics',
      'Payment metrics',
      'Water usage metrics',
      'Monthly breakdown',
      'Summary statistics',
    ],
  },
  financial: {
    name: 'Financial Report',
    description: 'Financial overview with revenue, payments, and outstanding amounts',
    endpoint: '/api/reports/financial',
    includes: [
      'Revenue metrics',
      'Payment metrics',
      'Outstanding amounts by status',
      'Outstanding by building',
      'Cash flow',
    ],
  },
  occupancy: {
    name: 'Occupancy Report',
    description: 'Unit occupancy statistics and lease expirations',
    endpoint: '/api/reports/occupancy',
    includes: [
      'Total units',
      'Occupancy metrics',
      'Occupancy by building',
      'Lease expirations',
    ],
  },
  revenue: {
    name: 'Revenue Report',
    description: 'Revenue breakdown by month and building',
    endpoint: '/api/reports/revenue',
    includes: [
      'Revenue metrics',
      'Monthly breakdown',
      'Revenue by building',
      'Revenue trends',
    ],
  },
  utility: {
    name: 'Utility Report',
    description: 'Water usage and billing statistics',
    endpoint: '/api/reports/utility',
    includes: [
      'Water usage metrics',
      'Water bills by building',
      'Water bills by unit',
    ],
  },
  performance: {
    name: 'Performance Report',
    description: 'Collection performance and tenant reliability',
    endpoint: '/api/reports/performance',
    includes: [
      'Collection metrics',
      'Tenant reliability scores',
      'Top performers',
      'Issues and concerns',
    ],
  },
  rent: {
    name: 'Rent Collection Report',
    description: 'Rent collection statistics and overdue invoices',
    endpoint: '/api/reports/rent',
    includes: [
      'Collection metrics',
      'Monthly collection breakdown',
      'Overdue invoices',
    ],
  },
}

// Example 10: Query parameters
export const queryParameters = {
  start_date: {
    type: 'string (YYYY-MM-DD)',
    description: 'Start date for the report period',
    example: '2024-01-01',
    required: false,
  },
  end_date: {
    type: 'string (YYYY-MM-DD)',
    description: 'End date for the report period',
    example: '2024-12-31',
    required: false,
  },
  building_id: {
    type: 'string (UUID)',
    description: 'Filter reports by specific building',
    example: 'uuid-here',
    required: false,
  },
  format: {
    type: 'string',
    description: 'Output format',
    options: ['json', 'csv', 'pdf'],
    default: 'json',
    required: false,
  },
}

