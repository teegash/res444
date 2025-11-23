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

export async function GET(request: NextRequest) {
  try {
    const user = await assertManager()
    const propertyId = request.nextUrl.searchParams.get('propertyId') || null
    const admin = createAdminClient()

    const query = admin
      .from('expenses')
      .select(
        `
        id,
        amount,
        incurred_at,
        category,
        notes,
        property_id,
        apartment_buildings ( id, name, location )
      `
      )
      .order('incurred_at', { ascending: false })
      .eq('created_by', user.id)

    if (propertyId && propertyId !== 'all') {
      query.eq('property_id', propertyId)
    }

    const { data, error } = await query
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
    console.error('[Expenses.GET] Failed to load expenses', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load expenses.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await assertManager()
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const { property_id, amount, category, incurred_at, notes } = body || {}

    if (!property_id) {
      return NextResponse.json({ success: false, error: 'Property is required.' }, { status: 400 })
    }
    if (!amount || Number.isNaN(Number(amount))) {
      return NextResponse.json({ success: false, error: 'Valid amount is required.' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category is required.' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('expenses')
      .insert({
        property_id,
        amount: Number(amount),
        category,
        incurred_at: incurred_at || new Date().toISOString(),
        notes: notes || null,
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
    console.error('[Expenses.POST] Failed to create expense', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create expense.' },
      { status: 500 }
    )
  }
}
