import { NextRequest, NextResponse } from 'next/server'
import { requireManagerContext } from './_helpers'

export async function GET(req: NextRequest) {
  const status = (req.nextUrl.searchParams.get('status') || '').trim()
  const stage = (req.nextUrl.searchParams.get('stage') || '').trim()
  const caseType = (req.nextUrl.searchParams.get('case_type') || '').trim()
  const search = (req.nextUrl.searchParams.get('search') || '').trim().toLowerCase()

  const auth = await requireManagerContext()
  if ((auth as any).error) return (auth as any).error

  try {
    const { admin, organizationId } = auth as any

    let q = admin
      .from('tenant_transition_cases')
      .select(
        `
        id,
        organization_id,
        lease_id,
        unit_id,
        tenant_user_id,
        vacate_notice_id,
        case_type,
        status,
        stage,
        expected_vacate_date,
        actual_vacate_date,
        handover_date,
        deposit_amount,
        deposit_deductions,
        deposit_refund_amount,
        refund_status,
        damage_cost,
        created_at,
        updated_at,
        unit:apartment_units (
          id,
          unit_number,
          status,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (status) q = q.eq('status', status)
    if (stage) q = q.eq('stage', stage)
    if (caseType) q = q.eq('case_type', caseType)

    const { data: cases, error } = await q
    if (error) throw error

    const rows = cases || []
    if (rows.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const tenantIds = Array.from(new Set(rows.map((r: any) => r.tenant_user_id).filter(Boolean)))

    const { data: profiles } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .eq('organization_id', organizationId)
      .in('id', tenantIds)

    const profileMap = new Map<string, any>()
    ;(profiles || []).forEach((p: any) => profileMap.set(p.id, p))

    const filtered = !search
      ? rows
      : rows.filter((r: any) => {
          const p = profileMap.get(r.tenant_user_id)
          const tenantName = String(p?.full_name || '').toLowerCase()
          const unitNumber = String(r.unit?.unit_number || '').toLowerCase()
          const buildingName = String(r.unit?.building?.name || '').toLowerCase()
          return [tenantName, unitNumber, buildingName].some((v) => v.includes(search))
        })

    const payload = filtered.map((r: any) => {
      const p = profileMap.get(r.tenant_user_id)
      return {
        ...r,
        tenant: {
          id: r.tenant_user_id,
          full_name: p?.full_name || 'Tenant',
          phone_number: p?.phone_number || '',
        },
      }
    })

    return NextResponse.json({ success: true, data: payload })
  } catch (err) {
    console.error('[TenantTransitions.GET] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load transition cases.' },
      { status: 500 }
    )
  }
}
