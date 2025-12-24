import { NextResponse } from 'next/server'
import { getManagerContext } from '@/lib/lease-renewals/auth'
import { getRequestAuditMeta, logLeaseRenewalEvent } from '@/lib/lease-renewals/audit'
import { generateKenyanLeaseRenewalPdf } from '@/lib/lease-renewals/renewalPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeIsoDate(value: unknown) {
  if (!value) return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return d
}

function computeDefaultRenewalTerm(leaseEndDateIso: string | null | undefined) {
  const end = leaseEndDateIso ? new Date(leaseEndDateIso) : new Date()
  const start = new Date(end)
  start.setDate(start.getDate() + 1)
  const months = 12
  const endCandidate = addMonths(start, months)
  endCandidate.setDate(endCandidate.getDate() - 1)
  return {
    months,
    startDateISO: start.toISOString(),
    endDateISO: endCandidate.toISOString(),
  }
}

function buildRenewalStoragePath(args: {
  orgId: string
  leaseId: string
  renewalId: string
  filename: 'unsigned.pdf' | 'tenant_signed.pdf' | 'fully_signed.pdf'
}) {
  return `org/${args.orgId}/lease/${args.leaseId}/renewal/${args.renewalId}/${args.filename}`
}

export async function POST(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) return ctx.error

    const { admin, orgId, userId } = ctx
    const leaseId = params.leaseId
    if (!leaseId) {
      return NextResponse.json({ success: false, error: 'Lease id is required.' }, { status: 400 })
    }

    // Idempotency: if there is an active renewal envelope, return it.
    const { data: existing, error: existingError } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('organization_id', orgId)
      .eq('lease_id', leaseId)
      .in('status', ['draft', 'sent_to_tenant', 'tenant_signed', 'manager_signed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existing?.id) {
      return NextResponse.json({ success: true, data: existing, existing: true })
    }

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
          unit_number,
          building:apartment_buildings (
            name,
            location
          )
        )
      `
      )
      .eq('id', leaseId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (leaseErr) throw leaseErr
    if (!lease) {
      return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 })
    }

    if (!(lease as any).tenant_user_id) {
      return NextResponse.json({ success: false, error: 'Lease has no tenant assigned.' }, { status: 409 })
    }

    const { data: tenantProfile, error: tenantErr } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, email')
      .eq('id', (lease as any).tenant_user_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (tenantErr) throw tenantErr
    if (!tenantProfile) {
      return NextResponse.json({ success: false, error: 'Tenant profile not found.' }, { status: 404 })
    }

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()

    if (orgErr) {
      // Non-blocking: fall back to generic header.
      console.warn('[LeaseRenewalCreate] Failed to load organization profile', orgErr)
    }

    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .insert({
        organization_id: orgId,
        lease_id: leaseId,
        tenant_user_id: (lease as any).tenant_user_id,
        status: 'draft',
      })
      .select('*')
      .single()

    if (renewErr) throw renewErr

    const nowIso = new Date().toISOString()
    const renewalTerm = computeDefaultRenewalTerm((lease as any).end_date)

    const unsignedBytes = await generateKenyanLeaseRenewalPdf({
      organization: {
        name: String((org as any)?.name || 'Organization'),
        location: ((org as any)?.location || (org as any)?.address || null) as any,
        phone: ((org as any)?.phone || (org as any)?.phone_number || null) as any,
        email: ((org as any)?.email || null) as any,
        address: ((org as any)?.address || null) as any,
      },
      renewal: { id: renewal.id, createdAtISO: nowIso },
      lease: {
        id: leaseId,
        startDate: safeIsoDate((lease as any).start_date),
        endDate: safeIsoDate((lease as any).end_date),
        monthlyRent: Number((lease as any).monthly_rent ?? 0) || null,
        depositAmount: Number((lease as any).deposit_amount ?? 0) || null,
      },
      tenant: {
        id: (tenantProfile as any).id,
        name: String((tenantProfile as any).full_name || 'Tenant'),
        phone: ((tenantProfile as any).phone_number || null) as any,
        email: ((tenantProfile as any).email || null) as any,
      },
      premises: {
        buildingName: (lease as any)?.unit?.building?.name ?? null,
        buildingLocation: (lease as any)?.unit?.building?.location ?? null,
        unitNumber: (lease as any)?.unit?.unit_number ?? null,
      },
      renewalTerm,
    })

    const unsignedPath = buildRenewalStoragePath({
      orgId,
      leaseId,
      renewalId: renewal.id,
      filename: 'unsigned.pdf',
    })

    const { error: upErr } = await admin.storage
      .from('lease-renewals')
      .upload(unsignedPath, new Blob([unsignedBytes], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (upErr) throw upErr

    const { error: updErr } = await admin
      .from('lease_renewals')
      .update({
        pdf_unsigned_path: unsignedPath,
        status: 'sent_to_tenant',
        updated_at: nowIso,
      })
      .eq('id', renewal.id)

    if (updErr) throw updErr

    const audit = getRequestAuditMeta(req)
    await logLeaseRenewalEvent(admin as any, {
      renewalId: renewal.id,
      organizationId: orgId,
      actorUserId: userId,
      action: 'created_and_sent_to_tenant',
      metadata: { unsignedPath, renewalTerm },
      ip: audit.ip,
      userAgent: audit.userAgent,
    })

    return NextResponse.json({
      success: true,
      data: { ...renewal, pdf_unsigned_path: unsignedPath, status: 'sent_to_tenant' },
    })
  } catch (error) {
    console.error('[LeaseRenewalCreate] Failed to create renewal', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create lease renewal.' },
      { status: 500 }
    )
  }
}

