import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  const admin = makeAdminClient()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Missing SUPABASE url/key at runtime' },
      { status: 500 }
    )
  }

  const raw = await req.json().catch(() => ({ parse_error: true }))

  const { error } = await admin.from('mpesa_callback_audit').insert({
    organization_id: 'f6d504b6-0a85-4a52-97c4-02c558db4ef0',
    raw_payload: { debug: true, raw, at: new Date().toISOString() },
    received_at: new Date().toISOString(),
  })

  if (error) {
    return NextResponse.json({ ok: false, insert_error: error }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
