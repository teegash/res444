import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEMPLATE_METADATA } from '@/lib/sms/templateMetadata'

const MANAGER_ROLES = new Set(['admin', 'manager'])

const REMINDER_DEFS = [
  { key: 'rent_stage_1', cadence: 'Monthly (T-3 days)' },
  { key: 'rent_stage_2', cadence: 'Monthly (1st)' },
  { key: 'rent_stage_3', cadence: 'Monthly (5th)' },
  { key: 'rent_stage_4', cadence: 'Monthly (+7 days)' },
  { key: 'rent_stage_5', cadence: 'Monthly (+30 days)' },
] as const

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

export async function GET() {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error

  const { admin, organizationId } = ctx
  const now = new Date()
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const recentCutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from('reminders')
    .select('scheduled_for, sent_at, delivery_status, payload, last_error')
    .eq('organization_id', organizationId)
    .eq('reminder_type', 'rent_payment')
    .gte('scheduled_for', since.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const rows = Array.isArray(data) ? data : []

  const reminders = REMINDER_DEFS.map((def) => {
    const matching = rows.filter((row) => (row as any)?.payload?.template_key === def.key)
    const pending = matching.filter((row) => row.delivery_status === 'pending')
    const sortedByScheduled = [...matching]
      .map((row) => ({ ...row }))
      .filter((row) => row.scheduled_for)
      .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))

    const latest = sortedByScheduled[sortedByScheduled.length - 1] || null

    const nextScheduled =
      pending
        .map((row) => row.scheduled_for)
        .filter(Boolean)
        .sort()[0] || null

    const lastSentAt =
      matching
        .map((row) => row.sent_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null

    const lastSentTime = lastSentAt ? new Date(lastSentAt).getTime() : 0
    const latestScheduledTime = latest?.scheduled_for
      ? new Date(latest.scheduled_for).getTime()
      : 0
    const latestFailed =
      latest?.delivery_status === 'failed' && latestScheduledTime >= lastSentTime

    const active =
      (pending.length > 0 || (lastSentAt ? new Date(lastSentAt).getTime() >= recentCutoff.getTime() : false)) &&
      !latestFailed

    return {
      key: def.key,
      name: TEMPLATE_METADATA[def.key].name,
      cadence: def.cadence,
      next_scheduled_for: nextScheduled,
      last_sent_at: lastSentAt,
      status: active ? 'active' : 'inactive',
      pending_count: pending.length,
      last_status: latest?.delivery_status ?? null,
      last_error: latest?.last_error ?? null,
    }
  })

  return NextResponse.json({ reminders })
}
