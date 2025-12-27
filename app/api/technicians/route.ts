import { NextResponse } from 'next/server'
import { assertRole, getOrgContext } from '@/lib/auth/org'
import { createAdminClient } from '@/lib/supabase/admin'

type CreateTechnicianBody = {
  full_name: string
  phone?: string | null
  email?: string | null
  company?: string | null
  is_active?: boolean
  notes?: string | null
  profession_ids?: string[]
}

export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext()
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 })
    }
    const url = new URL(request.url)
    const professionId = url.searchParams.get('professionId')
    const activeOnly = url.searchParams.get('activeOnly') === 'true'

    if (professionId) {
      const { data, error } = await supabase
        .from('technician_profession_map')
        .select('technicians:technician_id(id, full_name, phone, email, company, notes, is_active)')
        .eq('organization_id', ctx.organizationId)
        .eq('profession_id', professionId)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      let technicians = (data ?? [])
        .map((row) => row.technicians)
        .filter(Boolean) as Array<{
        id: string
        full_name: string
        phone: string | null
        email: string | null
        company: string | null
        notes: string | null
        is_active: boolean
      }>

      if (activeOnly) {
        technicians = technicians.filter((tech) => tech.is_active)
      }

      technicians.sort((a, b) => a.full_name.localeCompare(b.full_name))

      return NextResponse.json({ ok: true, data: technicians })
    }

    let query = supabase
      .from('v_technicians_with_professions')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('full_name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      id: row?.id ?? row?.technician_id ?? row?.technicianId ?? row?.technicianID ?? null,
    }))

    return NextResponse.json({ ok: true, data: normalized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load technicians.'
    const status = message === 'Unauthenticated' ? 401 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext()
    assertRole(ctx, ['admin', 'manager'])

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 })
    }
    const body = (await request.json().catch(() => null)) as CreateTechnicianBody | null

    if (!body || !body.full_name?.trim()) {
      return NextResponse.json({ ok: false, error: 'full_name is required' }, { status: 400 })
    }

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .insert({
        organization_id: ctx.organizationId,
        full_name: body.full_name.trim(),
        phone: body.phone ?? null,
        email: body.email ?? null,
        company: body.company ?? null,
        is_active: body.is_active ?? true,
        notes: body.notes ?? null,
      })
      .select('id')
      .single()

    if (techErr) {
      return NextResponse.json({ ok: false, error: techErr.message }, { status: 400 })
    }

    const professionIds = Array.from(new Set(body.profession_ids ?? []))
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '' && id !== 'undefined')

    if (professionIds.length > 0) {
      const { error: mapErr } = await supabase.from('technician_profession_map').insert(
        professionIds.map((professionId) => ({
          organization_id: ctx.organizationId,
          technician_id: tech.id,
          profession_id: professionId,
        }))
      )

      if (mapErr) {
        return NextResponse.json({ ok: false, error: mapErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true, id: tech.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create technician.'
    const status =
      message === 'Unauthenticated' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
