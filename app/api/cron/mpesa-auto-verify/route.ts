import { NextRequest, NextResponse } from 'next/server'
import { autoVerifyMpesaPayments } from '@/lib/mpesa/autoVerify'

/**
 * M-Pesa Auto-Verification Cron Endpoint
 * 
 * This endpoint should be called every 30 seconds to auto-verify pending M-Pesa payments
 * 
 * Configuration:
 * - Vercel Cron: Add to vercel.json
 * - GitHub Actions: Schedule workflow
 * - External Cron: Call this endpoint every 30 seconds
 * 
 * Security:
 * - Use CRON_SECRET in Authorization header for protection
 * - Or configure IP whitelist in your hosting provider
 */
export async function GET(request: NextRequest) {
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

    // Check if auto-verify is enabled
    const autoVerifyEnabled = process.env.MPESA_AUTO_VERIFY_ENABLED !== 'false'
    if (!autoVerifyEnabled) {
      return NextResponse.json({
        success: true,
        message: 'M-Pesa auto-verification is disabled',
        data: {
          checked_count: 0,
          verified_count: 0,
          failed_count: 0,
          pending_count: 0,
          skipped_count: 0,
          error_count: 0,
          payments_auto_verified: [],
        },
      })
    }

    // Run auto-verification
    const result = await autoVerifyMpesaPayments()

    // Return result
    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Auto-verification completed: ${result.verified_count} verified, ${result.failed_count} failed, ${result.pending_count} pending`
        : 'Auto-verification failed',
      data: {
        checked_count: result.checked_count,
        verified_count: result.verified_count,
        failed_count: result.failed_count,
        pending_count: result.pending_count,
        skipped_count: result.skipped_count,
        error_count: result.error_count,
        payments_auto_verified: result.payments_auto_verified,
        errors: result.errors,
        executed_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    const err = error as Error
    console.error('Error in M-Pesa auto-verify cron:', err)

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

/**
 * Also support POST for manual triggers
 */
export async function POST(request: NextRequest) {
  return GET(request)
}

