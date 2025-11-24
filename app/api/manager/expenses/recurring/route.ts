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

  const role = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error('FORBIDDEN')
  }

  return user
}

function nextMonthFirst(from: Date = new Date()) {
  const date = new Date(from)
  date.setMonth(date.getMonth() + 1, 1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export async function GET() {
  try {
    await assertManager()
    const admin = createAdminClient()

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
    const user = await assertManager()
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const { property_id, amount, category, notes, start_date } = body || {}

    if (!property_id) {
      return NextResponse.json({ success: false, error: 'Property is required.' }, { status: 400 })
    }
    if (!amount || Number.isNaN(Number(amount))) {
      return NextResponse.json({ success: false, error: 'Valid amount is required.' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category is required.' }, { status: 400 })
    }

    const nextRun = start_date ? new Date(start_date).toISOString() : nextMonthFirst()

    const { data, error } = await admin
      .from('recurring_expenses')
      .insert({
        property_id,
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

    // Also record an expense entry immediately so it appears in listings/exports
    const incurredAt = start_date ? new Date(start_date).toISOString() : new Date().toISOString()
    await admin.from('expenses').insert({
      property_id,
      amount: Number(amount),
      category,
      notes: notes || null,
      incurred_at: incurredAt,
      created_by: user.id,
    })

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
