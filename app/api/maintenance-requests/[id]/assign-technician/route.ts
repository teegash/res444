import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertRole, getOrgContext } from '@/lib/auth/org'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeId(rawId?: string | null) {
  if (!rawId) return ''
  return decodeURIComponent(rawId).trim().replace(/\/+$/, '')
}

function isValidUuid(value?: string | null) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function extractRequestId(request: Request, params?: { id?: string }) {
  const paramId = normalizeId(params?.id)
  if (paramId) return paramId
  try {
    const url = new URL(request.url, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2) {
      return normalizeId(parts[parts.length - 2])
    }
    return ''
  } catch {
    return ''
  }
}

type Body = {
  technician_id: string
  profession_id: string
  maintenance_cost_paid_by?: 'tenant' | 'landlord'
  maintenance_cost?: number
  maintenance_cost_notes?: string | null
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const rawId = params?.id ?? null
    const requestId = extractRequestId(request, params)
    if (!isValidUuid(requestId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid maintenance request id',
          received: rawId,
          parsed: requestId || null,
        },
        { status: 400 }
      )
    }

    const ctx = await getOrgContext()
    assertRole(ctx, ['admin', 'manager', 'caretaker'])

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 })
    }

    const body = (await request.json().catch(() => null)) as Body | null
    if (!body?.technician_id || !body?.profession_id) {
      return NextResponse.json(
        { ok: false, error: 'technician_id and profession_id are required' },
        { status: 400 }
      )
    }

    if (!isValidUuid(body.technician_id) || !isValidUuid(body.profession_id)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid technician or profession id',
          received: {
            technician_id: body.technician_id ?? null,
            profession_id: body.profession_id ?? null,
          },
        },
        { status: 400 }
      )
    }

    const technicianId = body.technician_id.trim()
    const professionId = body.profession_id.trim()
    const paidBy = body.maintenance_cost_paid_by ?? 'tenant'
    const rawCost = body.maintenance_cost ?? 0
    const normalizedCost =
      typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : Number(rawCost)

    if (!Number.isFinite(normalizedCost) || normalizedCost < 0) {
      return NextResponse.json(
        { ok: false, error: 'Invalid maintenance cost amount' },
        { status: 400 }
      )
    }

    let maintenance_cost_paid_by: 'tenant' | 'landlord' =
      paidBy === 'landlord' ? 'landlord' : 'tenant'
    let maintenance_cost = 0

    if (maintenance_cost_paid_by === 'landlord') {
      if (normalizedCost <= 0) {
        return NextResponse.json(
          { ok: false, error: 'Maintenance cost must be greater than 0 when paid by landlord' },
          { status: 400 }
        )
      }
      maintenance_cost = Math.round(normalizedCost * 100) / 100
    }

    const maintenance_cost_notes =
      typeof body.maintenance_cost_notes === 'string' ? body.maintenance_cost_notes.trim() : null

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('id, full_name, phone, is_active')
      .eq('id', technicianId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (techErr || !tech) {
      return NextResponse.json({ ok: false, error: 'Technician not found' }, { status: 404 })
    }

    if (!tech.is_active) {
      return NextResponse.json({ ok: false, error: 'Technician is inactive' }, { status: 400 })
    }

    const { data: map, error: mapErr } = await supabase
      .from('technician_profession_map')
      .select('technician_id')
      .eq('organization_id', ctx.organizationId)
      .eq('technician_id', technicianId)
      .eq('profession_id', professionId)
      .maybeSingle()

    if (mapErr || !map) {
      return NextResponse.json(
        { ok: false, error: 'Technician does not have this profession' },
        { status: 400 }
      )
    }

    const { data: updated, error: upErr } = await supabase
      .from('maintenance_requests')
      .update({
        technician_id: tech.id,
        assigned_profession_id: professionId,
        assigned_technician_name: tech.full_name,
        assigned_technician_phone: tech.phone ?? null,
        status: 'assigned',
        maintenance_cost_paid_by,
        maintenance_cost,
        maintenance_cost_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('organization_id', ctx.organizationId)
      .select(
        'id, status, assigned_technician_name, assigned_technician_phone, technician_id, assigned_profession_id, tenant_user_id, title, maintenance_cost, maintenance_cost_paid_by, maintenance_cost_notes'
      )
      .single()

    if (upErr || !updated) {
      return NextResponse.json({ ok: false, error: upErr?.message || 'Failed to assign technician' }, { status: 400 })
    }

    if (updated.tenant_user_id) {
      const phoneSuffix = tech.phone ? ` (${tech.phone})` : ''
      await supabase.from('communications').insert({
        sender_user_id: ctx.userId,
        recipient_user_id: updated.tenant_user_id,
        organization_id: ctx.organizationId,
        related_entity_type: 'maintenance_request',
        related_entity_id: updated.id,
        message_text: `Technician ${tech.full_name} has been assigned${phoneSuffix}.`,
        message_type: 'in_app',
        read: false,
      })
    }

    const clearNotifications = supabase
      .from('communications')
      .update({ read: true })
      .eq('organization_id', ctx.organizationId)
      .eq('related_entity_type', 'maintenance_request')
      .eq('related_entity_id', updated.id)

    if (updated.tenant_user_id) {
      await clearNotifications.neq('recipient_user_id', updated.tenant_user_id)
    } else {
      await clearNotifications
    }

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to assign technician.'
    const status =
      message === 'Unauthenticated' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
