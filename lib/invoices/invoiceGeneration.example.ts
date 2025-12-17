/**
 * Example usage of invoice generation system
 * 
 * This file demonstrates how to use the invoice generation endpoints
 */

// Example 1: Generate monthly invoices manually
export async function generateMonthlyInvoicesExample() {
  const response = await fetch('/api/invoices/generate-monthly', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Authorization header will be handled by middleware
    },
  })

  const result = await response.json()

  if (result.success) {
    console.log('Invoices generated:', result.data)
    // {
    //   invoices_created: 45,
    //   rent_invoices: 40,
    //   water_invoices: 3,
    //   combined_invoices: 2,
    //   total_amount: 500000,
    //   leases_processed: 40,
    //   water_bills_included: 2,
    //   water_bills_separate: 3,
    //   overdue_invoices_marked: 5,
    //   reminders_sent: 40
    // }
  } else {
    console.error('Error:', result.error)
  }
}

// Example 2: Generate invoices for specific month
export async function generateInvoicesForMonth(month: string) {
  // month format: "2024-02" (YYYY-MM)
  const response = await fetch(
    `/api/invoices/generate-monthly?month=${month}`,
    {
      method: 'POST',
    }
  )

  const result = await response.json()
  return result
}

// Example 3: Get pending invoices for a lease
export async function getPendingInvoices(leaseId: string) {
  const response = await fetch(`/api/invoices/by-lease/${leaseId}/pending`, {
    method: 'GET',
  })

  const result = await response.json()

  if (result.success) {
    console.log('Pending invoices:', result.data)
    // {
    //   invoices: [
    //     {
    //       id: "uuid",
    //       lease_id: "uuid",
    //       invoice_type: "rent",
    //       amount: 10000,
    //       due_date: "2024-02-06",
    //       status: "unpaid",
    //       months_covered: 1,
    //       description: "Monthly rent for 2024-02"
    //     }
    //   ],
    //   total_pending: 10000,
    //   total_paid: 0,
    //   outstanding: 10000,
    //   count: 1
    // }
  }

  return result
}

// Example 4: Mark invoice as paid
export async function markInvoiceAsPaid(
  invoiceId: string,
  paymentDate?: string
) {
  const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
      notes: 'Payment received via M-Pesa',
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('Invoice updated:', result.data)
    // {
    //   invoice_id: "uuid",
    //   status: "paid",
    //   payment_date: "2024-02-01"
    // }
  }

  return result
}

// Example 5: Using from server action
export async function generateInvoicesServerAction() {
  'use server'

  const { generateMonthlyInvoices } = await import('./invoiceGeneration')
  const { requireAuth } = await import('@/lib/rbac/routeGuards')

  const { userId } = await requireAuth()

  const result = await generateMonthlyInvoices(userId)

  return result
}

// Example 6: Success response structure
export const successResponseExample = {
  success: true,
  message: 'Monthly invoices generated successfully',
  data: {
    invoices_created: 45,
    rent_invoices: 40,
    water_invoices: 3,
    combined_invoices: 2,
    total_amount: 500000,
    leases_processed: 40,
    water_bills_included: 2,
    water_bills_separate: 3,
    overdue_invoices_marked: 5,
    reminders_sent: 40,
  },
}

// Example 7: Error response examples
export const errorExamples = {
  noPermission: {
    success: false,
    error: 'You do not have permission to generate invoices',
  },
  noActiveLeases: {
    success: true,
    message: 'No active leases found',
    data: {
      invoices_created: 0,
      rent_invoices: 0,
      water_invoices: 0,
      combined_invoices: 0,
      total_amount: 0,
      leases_processed: 0,
      water_bills_included: 0,
      water_bills_separate: 0,
    },
  },
}

// Example 8: Cron job configuration (GitHub Actions + Supabase Edge Function)
/*
# .github/workflows/cron-invoices-monthly.yml
name: Generate Monthly Invoices

on:
  schedule:
    - cron: '0 0 1 * *'  # 1st of every month at midnight UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  generate-invoices:
    runs-on: ubuntu-latest
    steps:
      - name: Generate Monthly Invoices
        run: |
          curl -X POST https://YOUR_PROJECT_REF.functions.supabase.co/cron-invoices-monthly \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            --data '{}'
*/
