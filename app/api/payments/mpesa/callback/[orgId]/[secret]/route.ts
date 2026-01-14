import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Callback endpoint is live' }, { status: 200 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; secret: string } }
) {
  const orgId = params.orgId
  const secret = params.secret

  const ack = () =>
    NextResponse.json({ success: true, message: 'Callback received' }, { status: 200 })

  const admin = makeAdminClient()
  if (!admin) {
    console.error('[MpesaCallback] Missing env vars', {
      hasUrl: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    return ack()
  }

  let raw: any = null
  try {
    raw = await request.json()
  } catch (e) {
    raw = { parse_error: true, error: String(e) }
  }

  const { error } = await admin.from('mpesa_callback_audit').insert({
    organization_id: orgId,
    raw_payload: raw,
    received_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[MpesaCallback] audit insert failed', error)
  }

  if (secret) {
    // ignore for now, used only for inbound verification after audit
  }

  return ack()
}
