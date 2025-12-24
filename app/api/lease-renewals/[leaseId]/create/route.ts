import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authRoute'
import { supabaseAdmin, uploadPdfToLeaseRenewals } from '@/lib/storageAdmin'
import { unsignedRenewalPath } from '@/lib/leaseRenewalPaths'
import { requireOrgRole } from '@/lib/orgAccess'
import { generateKenyanLeaseRenewalPdf } from '@/lib/leaseRenewalPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function logEvent(
  admin: any,
  args: {
    renewal_id: string
    organization_id: string
    actor_user_id?: string | null
    action: string
    metadata?: any
    ip?: string | null
    user_agent?: string | null
  }
) {
  await admin.from('lease_renewal_events').insert({
    renewal_id: args.renewal_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id ?? null,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.user_agent ?? null,
  })
}

function deriveOrgId(lease: any) {
  return (
    lease?.organization_id ||
    lease?.unit?.organization_id ||
    lease?.unit?.building?.organization_id ||
    null
  )
}

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    const { user } = await requireUser()
    const leaseId = params.leaseId
    if (!leaseId) return NextResponse.json({ error: 'Missing leaseId' }, { status: 400 })

    const admin = supabaseAdmin()

    // Load lease + unit/building to derive org and for PDF details.
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
        deposit_amount,
        unit:apartment_units (
          id,
          unit_number,
          organization_id,
          building:apartment_buildings (
            id,
            name,
            location,
            organization_id
          )
        )
      `
      )
      .eq('id', leaseId)
      .maybeSingle()

    if (leaseErr) return NextResponse.json({ error: leaseErr.message }, { status: 400 })
    if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

    const orgId = deriveOrgId(lease)
    if (!orgId) return NextResponse.json({ error: 'Lease organization is missing' }, { status: 422 })
    if (!lease.organization_id) {
      await admin.from('leases').update({ organization_id: orgId }).eq('id', lease.id)
      ;(lease as any).organization_id = orgId
    }

    // Only manager/admin can create renewal envelopes.
    await requireOrgRole(user.id, orgId, ['admin', 'manager'])

    if (!lease.tenant_user_id) {
      return NextResponse.json({ error: 'Lease has no tenant assigned' }, { status: 409 })
    }

    // If an active renewal exists, return it (don’t create duplicates).
    const { data: existing, error: existingErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('lease_id', lease.id)
      .in('status', ['draft', 'sent_to_tenant', 'tenant_signed', 'manager_signed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 })
    if (existing?.id) {
      return NextResponse.json({ ok: true, renewalId: existing.id, existing: true })
    }

    // Create renewal envelope
    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .insert({
        organization_id: orgId,
        lease_id: lease.id,
        tenant_user_id: lease.tenant_user_id,
        status: 'draft',
      })
      .select('*')
      .single()

    if (renewErr) return NextResponse.json({ error: renewErr.message }, { status: 400 })

    // Org/tenant profile for better PDF wording.
    const { data: org } = await admin
      .from('organizations')
      .select('name, location, phone, phone_number')
      .eq('id', orgId)
      .maybeSingle()

    const { data: tenant } = await admin
      .from('user_profiles')
      .select('full_name, phone_number')
      .eq('id', lease.tenant_user_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const unsignedBytes = await generateKenyanLeaseRenewalPdf({
      organizationName: (org as any)?.name || 'Organization',
      organizationLocation: (org as any)?.location || null,
      organizationPhone: (org as any)?.phone || (org as any)?.phone_number || null,
      tenantName: (tenant as any)?.full_name || 'Tenant',
      tenantPhone: (tenant as any)?.phone_number || null,
      propertyName: (lease as any)?.unit?.building?.name || null,
      propertyLocation: (lease as any)?.unit?.building?.location || null,
      unitNumber: (lease as any)?.unit?.unit_number || null,
      leaseId: lease.id,
      renewalId: renewal.id,
      leaseStartDate: lease.start_date || null,
      leaseEndDate: lease.end_date || null,
      monthlyRent: lease.monthly_rent ?? null,
      depositAmount: lease.deposit_amount ?? null,
      generatedAtISO: nowIso,
    })

    const unsignedPath = unsignedRenewalPath(orgId, lease.id, renewal.id)
    await uploadPdfToLeaseRenewals(unsignedPath, unsignedBytes)

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_unsigned_path: unsignedPath,
        status: 'sent_to_tenant',
        updated_at: nowIso,
      })
      .eq('id', renewal.id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await logEvent(admin, {
      renewal_id: renewal.id,
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'created_and_sent_to_tenant',
      metadata: { unsignedPath },
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, renewalId: renewal.id, unsignedPath })
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

