import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>
type ManagerContextResult = { admin: AdminClient; orgId: string } | { error: NextResponse }

async function getManagerContext(): Promise<ManagerContextResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Server misconfigured: Supabase admin client unavailable.' },
        { status: 500 }
      ),
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load organization.' }, { status: 500 }) }
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { error: NextResponse.json({ success: false, error: 'Unable to load profile.' }, { status: 500 }) }
  }

  const orgId = membership?.organization_id || profile?.organization_id
  if (!orgId) {
    return { error: NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 }) }
  }

  const role = (membership?.role || profile?.role || '') as (typeof MANAGER_ROLES)[number] | ''
  if (!role || !MANAGER_ROLES.includes(role)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, orgId }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) {
      return ctx.error
    }

    const { admin, orgId } = ctx

    const buildingId =
      request.nextUrl.searchParams.get('buildingId') || request.nextUrl.searchParams.get('building_id')
    const rawQ = request.nextUrl.searchParams.get('q')?.trim() || ''

    let query = admin
      .from('vw_manager_statement_summary')
      .select('*')
      .eq('organization_id', orgId)

    if (buildingId) {
      query = query.eq('building_id', buildingId)
    }

    if (rawQ) {
      const q = rawQ.replace(/[,]/g, ' ')
      query = query.or(
        `tenant_name.ilike.%${q}%,building_name.ilike.%${q}%,unit_number.ilike.%${q}%`
      )
    }

    query = query
      .order('current_balance', { ascending: false })
      .order('oldest_due_date', { ascending: true })
      .limit(500)

    const { data, error } = await query
    if (error) {
      console.error('[ManagerStatementsList] Failed to load summary view', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const rows = data ?? []
    return NextResponse.json({ success: true, rows, data: rows })
  } catch (error) {
    console.error('[ManagerStatementsList] Failed to load statements summary', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load statements.' },
      { status: 500 }
    )
  }
}
