import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { hasPermission } from '@/lib/rbac/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantWithLease } from '@/lib/tenants/leaseCreation'

type ImportRow = {
  unit_number: string
  unit_id?: string
  full_name: string
  email: string
  phone_number: string
  national_id: string
  start_date?: string
  address?: string
  date_of_birth?: string
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const canCreate = await hasPermission(userId, 'tenant:create')
    if (!canCreate) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body || !body.property_id || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { success: false, error: 'property_id and rows[] are required' },
        { status: 400 }
      )
    }

    const propertyId = String(body.property_id)
    const rows: ImportRow[] = body.rows

    if (rows.length < 1) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 })
    }
    if (rows.length > 25) {
      return NextResponse.json({ success: false, error: 'Max 25 rows per request' }, { status: 413 })
    }

    const admin = createAdminClient()

    const { data: membership, error: mErr } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (mErr || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 403 })
    }
    const orgId = membership.organization_id

    const { data: building, error: bErr } = await admin
      .from('apartment_buildings')
      .select('id, organization_id')
      .eq('id', propertyId)
      .maybeSingle()

    if (bErr || !building) {
      return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })
    }
    if (building.organization_id !== orgId) {
      return NextResponse.json({ success: false, error: 'Access denied for this property' }, { status: 403 })
    }

    const results: Array<{ rowIndex: number; ok: boolean; error?: string; tenantEmail?: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]

      try {
        const unitNumber = String(r.unit_number || '').trim()
        const unitId = String(r.unit_id || '').trim()
        if (!unitNumber && !unitId) {
          results.push({ rowIndex: i, ok: false, error: 'unit_number is required' })
          continue
        }

        const unitQuery = admin
          .from('apartment_units')
          .select('id, status')
          .eq('building_id', propertyId)

        const { data: unit, error: uErr } = unitId
          ? await unitQuery.eq('id', unitId).maybeSingle()
          : await unitQuery.eq('unit_number', unitNumber).maybeSingle()

        if (uErr || !unit) {
          const label = unitId ? `id ${unitId}` : unitNumber
          results.push({ rowIndex: i, ok: false, error: `Unit not found: ${label}` })
          continue
        }

        if (unit.status !== 'vacant') {
          results.push({ rowIndex: i, ok: false, error: `Unit ${unitNumber} is not vacant (${unit.status})` })
          continue
        }

        const startDate = (r.start_date && String(r.start_date).trim()) || new Date().toISOString().slice(0, 10)

        const createRes = await createTenantWithLease(
          {
            unit_id: unit.id,
            tenant: {
              full_name: String(r.full_name || '').trim(),
              email: String(r.email || '').trim(),
              phone_number: String(r.phone_number || '').trim(),
              national_id: String(r.national_id || '').trim(),
              address: r.address ? String(r.address).trim() : undefined,
              date_of_birth: r.date_of_birth ? String(r.date_of_birth).trim() : undefined,
            },
            lease: { start_date: startDate },
          },
          userId
        )

        if (!createRes.success) {
          const errMsg =
            createRes.error ||
            (createRes.validationErrors?.map((x) => `${x.field}: ${x.error}`).join('; ') ??
              'Failed to import')
          results.push({ rowIndex: i, ok: false, error: errMsg })
          continue
        }

        results.push({ rowIndex: i, ok: true, tenantEmail: createRes.data?.tenant.email })
      } catch (e: any) {
        results.push({ rowIndex: i, ok: false, error: e?.message || 'Unexpected error' })
      }
    }

    return NextResponse.json({ success: true, results }, { status: 200 })
  } catch (e) {
    console.error('[tenants/bulk-import] error', e)
    return NextResponse.json({ success: false, error: 'Bulk import failed' }, { status: 500 })
  }
}
