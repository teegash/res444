import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: Promise<{ orgId: string; secret: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const resolved = await params
  return NextResponse.json({
    success: true,
    debug_version: 'mpesa-callback-2026-01-15-0720',
    resolved_params: resolved,
  })
}
