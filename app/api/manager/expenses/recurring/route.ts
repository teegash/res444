import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

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
  // If that month's 1st is already in the past (most common), schedule next month's 1st.
  if (candidate.getTime() <= now.getTime()) return nextMonthFirstUtc(now)
  return candidate
}

export async function GET() {
  try {
    const { orgId, admin } = await assertManager()

    const { data, error } = await admin
      .from('recurring_expenses')
      .select(
        `
        id,
        property_id,
        category,
        amount,
        notes,
        next_run,
        active,
        apartment_buildings ( id, name, location )
      `
      )
      .eq('organization_id', orgId)
      .order('next_run', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
      }
    }
    console.error('[RecurringExpenses.GET] Failed to load recurring expenses', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load recurring expenses.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, orgId, admin } = await assertManager()
    const body = await request.json().catch(() => ({}))
    const { property_id, amount, category, notes, incurred_at, start_date } = body || {}

    if (!property_id) {
      return NextResponse.json({ success: false, error: 'Property is required.' }, { status: 400 })
    }
    if (!amount || Number.isNaN(Number(amount))) {
      return NextResponse.json({ success: false, error: 'Valid amount is required.' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category is required.' }, { status: 400 })
    }

    // Recurring expenses always run on the 1st (00:00 UTC) of the chosen month.
    // We treat the provided date as the "start month" hint, not the exact run timestamp.
    const nextRun = computeFirstRunUtc(incurred_at || start_date).toISOString()

    const { data, error } = await admin
      .from('recurring_expenses')
      .insert({
        property_id,
        organization_id: orgId,
        amount: Number(amount),
        category,
        notes: notes || null,
        next_run: nextRun,
        active: true,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
      }
    }
    console.error('[RecurringExpenses.POST] Failed to create recurring expense', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create recurring expense.' },
      { status: 500 }
    )
  }
}
