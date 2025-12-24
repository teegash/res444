import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin } from '@/lib/storageAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['admin', 'manager', 'caretaker'])

export async function GET() {
  try {
    const { user } = await requireUser()
    const admin = supabaseAdmin()

    const { data: membership, error: membershipErr } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membershipErr) return NextResponse.json({ error: membershipErr.message }, { status: 400 })
    const orgId = (membership as any)?.organization_id
    const role = String((membership as any)?.role || '')
    if (!orgId) return NextResponse.json({ error: 'Organization not found.' }, { status: 403 })
    if (!role || !ALLOWED_ROLES.has(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: renewals, error } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, rows: renewals ?? [] })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

