import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  return NextResponse.json(
    {
      ok: true,
      now: new Date().toISOString(),
      supabaseUrl,
      hasServiceRole,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelUrl: process.env.VERCEL_URL || null,
    },
    { status: 200 }
  )
}
