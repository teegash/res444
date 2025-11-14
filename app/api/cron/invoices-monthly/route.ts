import { NextRequest, NextResponse } from 'next/server'
import { generateMonthlyInvoices } from '@/lib/invoices/invoiceGeneration'
import { markOverdueInvoices } from '@/lib/invoices/invoiceGeneration'
import { sendRentPaymentReminders } from '@/lib/invoices/reminders'

/**
 * Cron endpoint for monthly invoice generation
 * Should be called on the 1st of each month
 * 
 * Configure in your cron service (e.g., Vercel Cron, GitHub Actions, etc.):
 * - Schedule: 0 0 1 * * (1st of every month at midnight UTC)
 * - URL: https://yourdomain.com/api/cron/invoices-monthly
 * - Method: POST
 * - Headers: Authorization: Bearer YOUR_CRON_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    // Use system user ID for automated operations
    // In production, you might want to use a service account user
    const systemUserId = process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000'

    // Get current date
    const today = new Date()
    const dayOfMonth = today.getDate()

    // Only run on 1st of month (or allow manual trigger)
    if (dayOfMonth !== 1 && !request.headers.get('x-manual-trigger')) {
      return NextResponse.json({
        success: true,
        message: 'Not the 1st of the month. Skipping invoice generation.',
        skipped: true,
      })
    }

    // 1. Generate monthly invoices
    const invoiceResult = await generateMonthlyInvoices(systemUserId)

    if (!invoiceResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: invoiceResult.error || 'Failed to generate invoices',
        },
        { status: 500 }
      )
    }

    // 2. Mark overdue invoices
    const overdueResult = await markOverdueInvoices()

    // 3. Send reminders (on 1st, 5th, and 7th)
    let remindersSent = 0
    if (dayOfMonth === 1 || dayOfMonth === 5 || dayOfMonth === 7) {
      const reminderResult = await sendRentPaymentReminders(
        dayOfMonth as 1 | 5 | 7
      )
      remindersSent = reminderResult.reminders_sent || 0
    }

    return NextResponse.json({
      success: true,
      message: 'Monthly invoice generation completed',
      data: {
        invoices: invoiceResult.data,
        overdue_invoices_marked: overdueResult.overdue_count || 0,
        reminders_sent: remindersSent,
        generated_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error in monthly invoice cron:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
        details: err.message,
      },
      { status: 500 }
    )
  }
}

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Monthly invoice generation cron endpoint',
    schedule: 'Runs on 1st of each month',
  })
}

