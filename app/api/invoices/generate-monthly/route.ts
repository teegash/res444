import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { generateMonthlyInvoices } from '@/lib/invoices/invoiceGeneration'
import { markOverdueInvoices } from '@/lib/invoices/invoiceGeneration'
import { sendRentPaymentReminders } from '@/lib/invoices/reminders'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Check permission
    const canGenerate = await hasPermission(userId, 'invoice:create')
    if (!canGenerate) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to generate invoices',
        },
        { status: 403 }
      )
    }

    // 3. Parse optional target month from query params or body
    const { searchParams } = new URL(request.url)
    const targetMonth = searchParams.get('month') || undefined

    // 4. Generate monthly invoices
    const result = await generateMonthlyInvoices(userId, targetMonth)

    if (!result.success) {
      return NextResponse.json(result, { status: 500 })
    }

    // 5. Mark overdue invoices
    const overdueResult = await markOverdueInvoices()

    // 6. Send reminders if it's the 1st, 5th, or 7th of the month
    const today = new Date()
    const dayOfMonth = today.getDate()
    let remindersSent = 0

    if (dayOfMonth === 1 || dayOfMonth === 5 || dayOfMonth === 7) {
      const reminderResult = await sendRentPaymentReminders(
        dayOfMonth as 1 | 5 | 7
      )
      remindersSent = reminderResult.reminders_sent || 0
    }

    // 7. Return success response
    return NextResponse.json(
      {
        ...result,
        data: {
          ...result.data,
          overdue_invoices_marked: overdueResult.overdue_count || 0,
          reminders_sent: remindersSent,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const err = error as Error
    console.error('Error in generate-monthly endpoint:', err)

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
      error: 'Method not allowed. Use POST to generate monthly invoices.',
    },
    { status: 405 }
  )
}

