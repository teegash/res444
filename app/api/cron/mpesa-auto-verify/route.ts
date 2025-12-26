import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vercel Cron Proxy -> Supabase Edge Function
 *
 * - Vercel Cron calls this endpoint on schedule.
 * - This endpoint forwards securely to Supabase Edge Function mpesa-auto-verify.
 *
 * Security:
 * - Allow Vercel Cron calls via `x-vercel-cron: 1`
 * - Allow manual admin calls via Authorization Bearer CRON_SECRET (optional)
 * - Supabase Edge Function is protected by x-cron-secret (SUPABASE_EDGE_CRON_SECRET)
 */
function isVercelCron(request: NextRequest) {
  return request.headers.get('x-vercel-cron') === '1'
}

export async function GET(request: NextRequest) {
  try {
    const enabled = (process.env.ENABLE_VERCEL_CRON_JOBS ?? '').toLowerCase() === 'true'
    if (!enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'cron_disabled_by_env' }, { status: 200 })
    }

    const cronHeaderOk = isVercelCron(request)

    const authHeader = request.headers.get('authorization') ?? ''
    const cronSecret = process.env.CRON_SECRET ?? ''
    const manualOk = cronSecret ? authHeader === `Bearer ${cronSecret}` : false

    if (!cronHeaderOk && !manualOk) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden (not Vercel Cron and not authorized manually)' },
        { status: 403 }
      )
    }

    const targetUrl = process.env.SUPABASE_EDGE_MPESA_AUTOVERIFY_URL ?? ''
    const supaSecret = process.env.SUPABASE_EDGE_CRON_SECRET ?? ''

    if (!targetUrl || !supaSecret) {
      return NextResponse.json(
        { ok: false, error: 'Missing SUPABASE_EDGE_MPESA_AUTOVERIFY_URL or SUPABASE_EDGE_CRON_SECRET' },
        { status: 500 }
      )
    }

    const incoming = new URL(request.url)
    const forwardUrl = new URL(targetUrl)

    // Forward any incoming query params (for manual debugging)
    incoming.searchParams.forEach((value, key) => {
      forwardUrl.searchParams.set(key, value)
    })

    // HARD CAP: never process more than 100 records per cron run
    // This protects Vercel + Supabase costs even if defaults change later
    forwardUrl.searchParams.set('limit', '100')

    const res = await fetch(forwardUrl.toString(), {
      method: 'POST',
      headers: {
        'x-cron-secret': supaSecret,
        'Content-Type': 'application/json',
      },
      body: '',
      cache: 'no-store',
    })

    const text = await res.text()

    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
