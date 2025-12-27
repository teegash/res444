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

  if (membershipError || !membership?.organization_id) {
    throw new Error('ORG_NOT_FOUND')
  }

  const role = (membership?.role || user.user_metadata?.role || '').toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error('FORBIDDEN')
  }

  return { user, orgId: membership.organization_id, admin }
}

export async function GET(request: NextRequest) {
  try {
    const { orgId, admin } = await assertManager()
    const propertyId = request.nextUrl.searchParams.get('propertyId') || null
    const source = request.nextUrl.searchParams.get('source') || null

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
        maintenance_request_id,
        apartment_buildings ( id, name, location )
      `
      )
      .order('incurred_at', { ascending: false })
      .eq('organization_id', orgId)

    if (propertyId && propertyId !== 'all') {
      query.eq('property_id', propertyId)
    }
    if (source === 'maintenance') {
      query.not('maintenance_request_id', 'is', null)
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
    const { user, orgId, admin } = await assertManager()
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

    const normalizeIncurredAt = (value: any) => {
      if (!value) return new Date().toISOString()
      const raw = String(value).trim()
      if (!raw) return new Date().toISOString()
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
      return new Date().toISOString()
    }

    const { data, error } = await admin
      .from('expenses')
      .insert({
        property_id,
        organization_id: orgId,
        amount: Number(amount),
        category,
        incurred_at: normalizeIncurredAt(incurred_at),
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
      if (error.message === 'ORG_NOT_FOUND') {
        return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
      }
    }
    console.error('[Expenses.POST] Failed to create expense', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create expense.' },
      { status: 500 }
    )
  }
}
