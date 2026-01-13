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

  const selectFull =
    'id,function_name,started_at,finished_at,ok,error,inserted_count,attempted_count,skipped_prepaid,leases_processed,months_considered,catch_up,meta'
  const selectFallback = 'id,function_name,started_at,finished_at,ok,error,meta'

  const fetchRuns = async (table: string) => {
    let result = await admin
      .from(table)
      .select(selectFull)
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(100)

    if (result.error) {
      const msg = String(result.error.message || '')
      if (/column .* does not exist/i.test(msg)) {
        result = await admin
          .from(table)
          .select(selectFallback)
          .eq('organization_id', organizationId)
          .order('started_at', { ascending: false })
          .limit(100)
      }
    }
    return result
  }

  let runsRes = await fetchRuns('cron_runs')
  const firstHasRows = Array.isArray(runsRes.data) && runsRes.data.length > 0
  if (runsRes.error || !firstHasRows) {
    const fallbackRes = await fetchRuns('cronruns')
    if (!fallbackRes.error && Array.isArray(fallbackRes.data)) {
      runsRes = fallbackRes
    }
  }

  if (runsRes.error) {
    return NextResponse.json({ error: runsRes.error.message }, { status: 400 })
  }

  const runs = Array.isArray(runsRes.data) ? runsRes.data : []
  if (type === 'sms') {
    const filtered = runs.filter((row: any) => {
      const name = String(row?.function_name || '').toLowerCase()
      return name.includes('sms') || name.includes('reminder')
    })
    return NextResponse.json({ runs: filtered.length ? filtered : runs })
  }

  return NextResponse.json({ runs })
}
