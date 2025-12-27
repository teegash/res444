import { NextResponse } from 'next/server'
import { getOrgContext, supabaseServer } from '@/lib/auth/org'

export async function GET() {
  try {
    const ctx = await getOrgContext()
    const supabase = await supabaseServer()

    const { data, error } = await supabase
      .from('technician_professions')
      .select('id, name')
      .eq('organization_id', ctx.organizationId)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load professions.'
    const status = message === 'Unauthenticated' ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
