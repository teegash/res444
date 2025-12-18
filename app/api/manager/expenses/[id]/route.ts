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

  if (membershipError || !membership?.organization_id) {
    throw new Error('ORG_NOT_FOUND')
  }

  const role = (membership?.role || user.user_metadata?.role || '').toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new Error('FORBIDDEN')
  }

  return { user, orgId: membership.organization_id, admin }
}

function normalizeIncurredAt(value: any) {
  if (!value) return new Date().toISOString()
  const raw = String(value).trim()
  if (!raw) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return new Date().toISOString()
}

export async function PUT(request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { orgId, admin } = await assertManager()
    const id = ctx.params.id
    if (!id || !isUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid expense id.' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))

    const { data: existing, error: existingError } = await admin
      .from('expenses')
      .select('id, organization_id')
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
    if (body.incurred_at !== undefined) patch.incurred_at = normalizeIncurredAt(body.incurred_at)

    const { error: updateError } = await admin
      .from('expenses')
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
    console.error('[Expenses.PUT] Failed to update expense', error)
    return NextResponse.json({ success: false, error: 'Failed to update expense.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { orgId, admin } = await assertManager()
    const id = ctx.params.id
    if (!id || !isUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid expense id.' }, { status: 400 })
    }

    const { error } = await admin.from('expenses').delete().eq('id', id).eq('organization_id', orgId)
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
    console.error('[Expenses.DELETE] Failed to delete expense', error)
    return NextResponse.json({ success: false, error: 'Failed to delete expense.' }, { status: 500 })
  }
}
