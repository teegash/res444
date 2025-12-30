import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'tenant-transitions'
const SIGNED_URL_TTL = 60 * 30

async function signPath(admin: any, path?: string | null) {
  if (!path) return null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) return null
  return data?.signedUrl || null
}

async function fetchCurrentLease(admin: any, tenantUserId: string) {
  const { data } = await admin
    .from('leases')
    .select('id, organization_id, unit_id, tenant_user_id, status')
    .eq('tenant_user_id', tenantUserId)
    .in('status', ['active', 'pending', 'renewed'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Server misconfigured.' }, { status: 500 })
    }

    const lease = await fetchCurrentLease(admin, user.id)
    if (!lease?.id) {
      return NextResponse.json({ success: true, case: null, events: [] })
    }

    const { data: row } = await admin
      .from('tenant_transition_cases')
      .select(
        `
        *,
        unit:apartment_units (
          id, unit_number, status,
          building:apartment_buildings (id, name, location)
        )
      `
      )
      .eq('organization_id', lease.organization_id)
      .eq('lease_id', lease.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!row) {
      return NextResponse.json({ success: true, case: null, events: [] })
    }

    const { data: events } = await admin
      .from('tenant_transition_events')
      .select('*')
      .eq('organization_id', lease.organization_id)
      .eq('case_id', row.id)
      .order('created_at', { ascending: true })

    const signed = {
      notice_document_url: await signPath(admin, row.notice_document_url),
      inspection_report_url: await signPath(admin, row.inspection_report_url),
      settlement_statement_url: await signPath(admin, row.settlement_statement_url),
    }

    return NextResponse.json({ success: true, case: { ...row, signed_urls: signed }, events: events || [] })
  } catch (err) {
    console.error('[TenantTransitions.GET] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load transition.' },
      { status: 500 }
    )
  }
}
