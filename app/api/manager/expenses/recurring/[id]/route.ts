import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

async function assertManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('UNAUTHORIZED')
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = (membership?.role || user.user_metadata?.role || '').toLowerCase()
  if (membershipError || !membership?.organization_id) {
    throw new Error('ORG_NOT_FOUND')
  }
  if (!role || !MANAGER_ROLES.has(role as any)) {
    throw new Error('FORBIDDEN')
  }

  return { user, orgId: membership.organization_id, admin }
}

function startOfMonthUtc(from: Date) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, 0, 0, 0, 0))
}

function nextMonthFirstUtc(from: Date) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0))
}

function computeFirstRunUtc(startHint: string | null | undefined) {
  const now = new Date()
  const hintDate = startHint ? new Date(startHint) : null
  const candidate = startOfMonthUtc(hintDate && !Number.isNaN(hintDate.getTime()) ? hintDate : now)
  if (candidate.getTime() <= now.getTime()) return nextMonthFirstUtc(now)
  return candidate
}

export async function PUT(request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { orgId, admin } = await assertManager()
    const id = ctx.params.id
    if (!id || !isUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid recurring expense id.' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))

    const { data: existing, error: existingError } = await admin
      .from('recurring_expenses')
      .select('id, organization_id, active, next_run')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 })
    }

    const patch: Record<string, any> = {}
    if (body.property_id) patch.property_id = String(body.property_id)
    if (body.category) patch.category = String(body.category)
    if (body.amount !== undefined) patch.amount = Number(body.amount)
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null
    if (body.active !== undefined) patch.active = Boolean(body.active)

    // Optional: treat provided date as start month hint for next_run, but always 1st (00:00 UTC).
    const startHint = body.incurred_at || body.start_date || body.next_run
    if (startHint) {
      patch.next_run = computeFirstRunUtc(String(startHint)).toISOString()
    } else if (patch.active === true) {
      // If re-activating an old schedule, ensure next_run isn't stuck in the past.
      const existingNext = existing.next_run ? new Date(existing.next_run as any) : null
      if (existingNext && existingNext.getTime() <= Date.now()) {
        patch.next_run = computeFirstRunUtc(null).toISOString()
      }
    }

    const { error: updateError } = await admin
      .from('recurring_expenses')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', orgId)

    if (updateError) throw updateError
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
      }
      if (error.message === 'ORG_NOT_FOUND') {
        return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
      }
    }
    console.error('[RecurringExpenses.PUT] Failed', error)
    return NextResponse.json({ success: false, error: 'Failed to update recurring expense.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { orgId, admin } = await assertManager()
    const id = ctx.params.id
    if (!id || !isUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid recurring expense id.' }, { status: 400 })
    }

    const { error } = await admin
      .from('recurring_expenses')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
      }
      if (error.message === 'ORG_NOT_FOUND') {
        return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
      }
    }
    console.error('[RecurringExpenses.DELETE] Failed', error)
    return NextResponse.json({ success: false, error: 'Failed to delete recurring expense.' }, { status: 500 })
  }
}
