import { NextResponse } from 'next/server'
import { assertRole, getOrgContext, supabaseServer } from '@/lib/auth/org'

type UpdateTechnicianBody = {
  full_name?: string
  phone?: string | null
  email?: string | null
  company?: string | null
  is_active?: boolean
  notes?: string | null
  profession_ids?: string[]
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getOrgContext()
    assertRole(ctx, ['admin', 'manager'])
    const supabase = await supabaseServer()
    const body = (await request.json().catch(() => null)) as UpdateTechnicianBody | null

    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
    }

    const updatePayload: Record<string, any> = {}
    if (body.full_name !== undefined) {
      const trimmed = body.full_name.trim()
      if (!trimmed) {
        return NextResponse.json({ ok: false, error: 'full_name is required' }, { status: 400 })
      }
      updatePayload.full_name = trimmed
    }
    if (body.phone !== undefined) updatePayload.phone = body.phone
    if (body.email !== undefined) updatePayload.email = body.email
    if (body.company !== undefined) updatePayload.company = body.company
    if (body.is_active !== undefined) updatePayload.is_active = body.is_active
    if (body.notes !== undefined) updatePayload.notes = body.notes

    if (Object.keys(updatePayload).length > 0) {
      const { error: upErr } = await supabase
        .from('technicians')
        .update(updatePayload)
        .eq('id', params.id)
        .eq('organization_id', ctx.organizationId)

      if (upErr) {
        return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 })
      }
    }

    if (body.profession_ids) {
      const professionIds = Array.from(new Set(body.profession_ids))

      const { error: delErr } = await supabase
        .from('technician_profession_map')
        .delete()
        .eq('organization_id', ctx.organizationId)
        .eq('technician_id', params.id)

      if (delErr) {
        return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 })
      }

      if (professionIds.length > 0) {
        const { error: insErr } = await supabase.from('technician_profession_map').insert(
          professionIds.map((professionId) => ({
            organization_id: ctx.organizationId,
            technician_id: params.id,
            profession_id: professionId,
          }))
        )

        if (insErr) {
          return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update technician.'
    const status =
      message === 'Unauthenticated' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getOrgContext()
    assertRole(ctx, ['admin', 'manager'])
    const supabase = await supabaseServer()

    const { error: mapErr } = await supabase
      .from('technician_profession_map')
      .delete()
      .eq('organization_id', ctx.organizationId)
      .eq('technician_id', params.id)

    if (mapErr) {
      return NextResponse.json({ ok: false, error: mapErr.message }, { status: 400 })
    }

    const { error } = await supabase
      .from('technicians')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete technician.'
    const status =
      message === 'Unauthenticated' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
