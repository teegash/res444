import { NextResponse } from 'next/server'

type Ctx = { params: { orgId?: string; secret?: string } }

export async function POST(_req: Request, ctx: Ctx) {
  return NextResponse.json({
    success: true,
    message: 'Callback received',
    debug_version: 'mpesa-callback-2026-01-15-0715',
    ctx_params: ctx?.params ?? null,
    ctx_keys: ctx ? Object.keys(ctx) : null,
  })
}
