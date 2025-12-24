import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { unsignedRenewalPath } from '@/lib/leaseRenewalPaths'
import { logLeaseRenewalEvent } from '@/lib/leaseRenewalAudit'
import { buildKenyanLeaseRenewalPdf } from '@/lib/leaseRenewalPdf'
import { requireOrgRole } from '@/lib/orgAccess'
import { supabaseAdmin, uploadPdfToLeaseRenewals } from '@/lib/storageAdmin'

export const runtime = 'nodejs'

const ACTIVE_RENEWAL_STATUSES = ['draft', 'sent_to_tenant', 'tenant_signed', 'manager_signed'] as const

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    const { user } = await requireUser()
    const leaseId = params.leaseId
    const admin = supabaseAdmin()

    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select(
        `
          id,
          organization_id,
          tenant_user_id,
          start_date,
          end_date,
          monthly_rent,
          unit:apartment_units (
            unit_number,
            building:apartment_buildings (
              name
            )
          )
        `
      )
      .eq('id', leaseId)
      .maybeSingle()

    if (leaseErr) return NextResponse.json({ success: false, error: leaseErr.message }, { status: 400 })
    if (!lease?.organization_id) return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 })

    const orgId = lease.organization_id as string

    await requireOrgRole(user.id, orgId, ['admin', 'manager'])

    const { data: existing, error: existingErr } = await admin
      .from('lease_renewals')
      .select('id, status, pdf_unsigned_path')
      .eq('lease_id', leaseId)
      .in('status', [...ACTIVE_RENEWAL_STATUSES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingErr) return NextResponse.json({ success: false, error: existingErr.message }, { status: 400 })

    let renewalId = existing?.id as string | undefined

    if (!renewalId) {
      const { data: renewal, error: renewErr } = await admin
        .from('lease_renewals')
        .insert({
          organization_id: orgId,
          lease_id: lease.id,
          tenant_user_id: lease.tenant_user_id,
          status: 'draft',
        })
        .select('id')
        .single()

      if (renewErr) return NextResponse.json({ success: false, error: renewErr.message }, { status: 400 })
      renewalId = renewal.id
    }

    if (!renewalId) {
      return NextResponse.json({ success: false, error: 'Failed to create renewal envelope.' }, { status: 500 })
    }

    const [{ data: organization }, { data: tenantProfile }] = await Promise.all([
      admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      admin
        .from('user_profiles')
        .select('full_name, national_id')
        .eq('id', lease.tenant_user_id)
        .eq('organization_id', orgId)
        .maybeSingle(),
    ])

    const organizationName = (organization as any)?.name || 'RES'
    const propertyName = (lease as any)?.unit?.building?.name ?? null
    const unitNumber = (lease as any)?.unit?.unit_number ?? null

    const unsignedBytes = await buildKenyanLeaseRenewalPdf({
      renewalId,
      leaseId: lease.id,
      organizationName,
      propertyName,
      unitNumber,
      tenantName: (tenantProfile as any)?.full_name ?? null,
      tenantNationalId: (tenantProfile as any)?.national_id ?? null,
      startDate: lease.start_date ?? null,
      endDate: lease.end_date ?? null,
      monthlyRent: lease.monthly_rent ?? null,
    })

    const unsignedPath = unsignedRenewalPath(orgId, lease.id, renewalId)
    await uploadPdfToLeaseRenewals(unsignedPath, unsignedBytes)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({ pdf_unsigned_path: unsignedPath, status: 'sent_to_tenant', updated_at: new Date().toISOString() })
      .eq('id', renewalId)

    if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 400 })

    await logLeaseRenewalEvent(admin, {
      renewal_id: renewalId,
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'created_and_sent_to_tenant',
      metadata: { unsignedPath, leaseId },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ success: true, data: { renewalId, unsignedPath } })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
