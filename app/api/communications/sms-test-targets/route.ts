import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager'])

async function requireOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 403 }) }
  }

  const role = membership.role || (user.user_metadata as any)?.role
  if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, organizationId: membership.organization_id }
}

export async function GET() {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error

  const { admin, organizationId } = ctx

  const { data: leases, error } = await admin
    .from('leases')
    .select(
      `
        id,
        tenant_user_id,
        status,
        unit:apartment_units!leases_unit_org_fk (
          id,
          unit_number,
          building:apartment_buildings!apartment_units_building_org_fk (
            id,
            name
          )
        )
      `
    )
    .eq('organization_id', organizationId)
    .in('status', ['active', 'pending', 'renewed'])
    .not('tenant_user_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const leaseRows = Array.isArray(leases) ? leases : []
  const tenantIds = Array.from(
    new Set(leaseRows.map((row: any) => row.tenant_user_id).filter(Boolean))
  )

  let profilesMap = new Map<string, { full_name: string | null; phone_number: string | null }>()
  if (tenantIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .in('id', tenantIds)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    profilesMap = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        { full_name: profile.full_name ?? null, phone_number: profile.phone_number ?? null },
      ])
    )
  }

  const targets = leaseRows
    .map((row: any) => {
      const unit = row.unit || null
      const building = unit?.building || null
      const profile = row.tenant_user_id ? profilesMap.get(row.tenant_user_id) : null

      if (!unit?.id || !building?.id) return null

      return {
        building_id: building.id,
        building_name: building.name || 'Building',
        unit_id: unit.id,
        unit_number: unit.unit_number || 'Unit',
        tenant_user_id: row.tenant_user_id,
        tenant_name: profile?.full_name || 'Tenant',
        tenant_phone: profile?.phone_number || null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ targets })
}
