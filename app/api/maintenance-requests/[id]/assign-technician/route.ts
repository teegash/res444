import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertRole, getOrgContext } from '@/lib/auth/org'

type Body = {
  technician_id: string
  profession_id: string
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
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

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('id, full_name, phone, is_active')
      .eq('id', body.technician_id)
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
      .eq('technician_id', body.technician_id)
      .eq('profession_id', body.profession_id)
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
        assigned_profession_id: body.profession_id,
        assigned_technician_name: tech.full_name,
        assigned_technician_phone: tech.phone ?? null,
        status: 'assigned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
      .select(
        'id, status, assigned_technician_name, assigned_technician_phone, technician_id, assigned_profession_id, tenant_user_id, title'
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

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to assign technician.'
    const status =
      message === 'Unauthenticated' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
