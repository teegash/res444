import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function nextMonthFirst(from: Date = new Date()) {
  const date = new Date(from)
  date.setMonth(date.getMonth() + 1, 1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export async function GET() {
  try {
    const admin = createAdminClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    const { data: schedules, error } = await admin
      .from('recurring_expenses')
      .select('id, property_id, amount, category, notes, next_run, active, created_by')
      .eq('active', true)
      .lte('next_run', todayIso)

    if (error) throw error

    const due = schedules || []
    if (due.length === 0) {
      return NextResponse.json({ success: true, data: { processed: 0 } })
    }

    const inserts = due.map((row) => ({
      property_id: row.property_id,
      amount: row.amount,
      category: row.category,
      notes: row.notes || 'Recurring expense',
      incurred_at: todayIso,
      created_by: row.created_by || null,
    }))

    const { error: insertError } = await admin.from('expenses').insert(inserts)
    if (insertError) throw insertError

    const updates = due.map((row) => ({
      id: row.id,
      next_run: nextMonthFirst(new Date(row.next_run || todayIso)),
    }))

    if (updates.length > 0) {
      const { error: updateError } = await admin
        .from('recurring_expenses')
        .upsert(updates)
      if (updateError) throw updateError
    }

    return NextResponse.json({ success: true, data: { processed: due.length } })
  } catch (error) {
    console.error('[CronRecurringExpenses] Failed to process recurring expenses', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process recurring expenses.' },
      { status: 500 }
    )
  }
}
