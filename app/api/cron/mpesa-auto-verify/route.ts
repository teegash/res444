import { NextResponse } from 'next/server'

/**
 * DISABLED
 *
 * M-Pesa auto verification is now executed via GitHub Actions
 * calling the Supabase Edge Function directly.
 *
 * This route is intentionally disabled to prevent:
 * - duplicate execution
 * - accidental Vercel cron usage
 * - unnecessary Vercel function cost
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      reason: 'mpesa-auto-verify is handled by GitHub Actions',
    },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      reason: 'mpesa-auto-verify is handled by GitHub Actions',
    },
    { status: 410 }
  )
}
