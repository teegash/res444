import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager'])

async function requireOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 403 }) }
  }

  const role = membership.role || (user.user_metadata as any)?.role
  if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, organizationId: membership.organization_id }
}

export async function GET(req: NextRequest) {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error

  const { admin, organizationId } = ctx
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'sms'

  let query = admin
    .from('cron_runs')
    .select(
      'id,function_name,started_at,finished_at,ok,error,inserted_count,attempted_count,skipped_prepaid,leases_processed,months_considered,catch_up,meta'
    )
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false })
    .limit(25)

  if (type === 'sms') {
    query = query.or('function_name.ilike.%sms%,function_name.ilike.%reminder%')
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ runs: data || [] })
}
