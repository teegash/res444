import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const VIEW_ROLES = new Set(['admin', 'manager', 'caretaker'])

type LedgerRow = {
  entry_date: string
  description: string
  debit: number
  credit: number
  entry_type: 'invoice' | 'payment'
  invoice_type?: string | null
  status_text?: string | null
}

function resolveTenantId(req: NextRequest, params?: { id?: string }) {
  let tenantId =
    params?.id ||
    req.nextUrl.searchParams.get('tenantId') ||
    req.nextUrl.searchParams.get('id') ||
    null

  if (!tenantId) {
    const segments = req.nextUrl.pathname.split('/').filter(Boolean)
    const tenantsIndex = segments.indexOf('tenants')
    if (tenantsIndex >= 0 && segments[tenantsIndex + 1]) {
      tenantId = segments[tenantsIndex + 1]
    } else if (segments.length >= 2 && segments[segments.length - 1] === 'vault') {
      tenantId = segments[segments.length - 2]
    }
  }

  return String(tenantId || '').trim()
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = resolveTenantId(req, params)
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: membership, error: memErr } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const orgId = membership?.organization_id || null
    const role = membership?.role ? String(membership.role).toLowerCase() : null

    if (memErr || !orgId || !role || !VIEW_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: archive } = await admin
      .from('tenant_archives')
      .select('id, archived_at, archived_by, reason, notes, snapshot, is_active')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (!archive) {
      return NextResponse.json({ success: false, error: 'Tenant is not archived.' }, { status: 404 })
    }

    const { data: profile } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, national_id, address, date_of_birth, created_at')
      .eq('organization_id', orgId)
      .eq('id', tenantId)
      .maybeSingle()

    let email: string | null = null
    try {
      const authUser = await admin.auth.admin.getUserById(tenantId)
      email = authUser?.data?.user?.email || null
    } catch {
      email = null
    }

    const { data: leases } = await admin
      .from('leases')
      .select(
        `
        id, unit_id, start_date, end_date, monthly_rent, deposit_amount, status, created_at,
        unit:apartment_units (
          id, unit_number, status, building_id,
          building:apartment_buildings ( id, name, location )
        )
      `
      )
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })

    const leaseIds = (leases || []).map((lease: any) => lease?.id).filter(Boolean)

    const { data: invoices } = leaseIds.length
      ? await admin
          .from('invoices')
          .select('id, lease_id, due_date, period_start, invoice_type, amount, status_text, created_at')
          .eq('organization_id', orgId)
          .in('lease_id', leaseIds)
          .order('due_date', { ascending: true })
      : { data: [] as any[] }

    const invoiceIds = (invoices || []).map((row: any) => row.id).filter(Boolean)

    const { data: payments } = invoiceIds.length
      ? await admin
          .from('payments')
          .select('id, invoice_id, amount_paid, payment_date, payment_method, created_at')
          .eq('organization_id', orgId)
          .in('invoice_id', invoiceIds)
          .order('payment_date', { ascending: true })
      : { data: [] as any[] }

    const { data: maintenance } = await admin
      .from('maintenance_requests')
      .select(
        'id, title, description, status, created_at, completed_at, maintenance_cost, maintenance_cost_paid_by, maintenance_cost_notes, unit_id'
      )
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .order('created_at', { ascending: false })

    const maintenanceIds = (maintenance || []).map((row: any) => row.id).filter(Boolean)

    const { data: maintExpenses } = maintenanceIds.length
      ? await admin
          .from('expenses')
          .select('id, maintenance_request_id, category, amount, incurred_at, notes')
          .eq('organization_id', orgId)
          .in('maintenance_request_id', maintenanceIds)
      : { data: [] as any[] }

    const ledger: LedgerRow[] = []
    for (const inv of invoices || []) {
      const dateValue = (inv.due_date || inv.period_start || inv.created_at || '').slice(0, 10)
      ledger.push({
        entry_date: dateValue,
        description: `Invoice: ${inv.invoice_type || 'invoice'} (#${String(inv.id).slice(0, 8)})`,
        debit: Number(inv.amount || 0),
        credit: 0,
        entry_type: 'invoice',
        invoice_type: inv.invoice_type || null,
        status_text: inv.status_text || null,
      })
    }

    for (const pay of payments || []) {
      const dateValue = (pay.payment_date || pay.created_at || '').slice(0, 10)
      ledger.push({
        entry_date: dateValue,
        description: `Payment: ${pay.payment_method || 'payment'} (#${String(pay.id).slice(0, 8)})`,
        debit: 0,
        credit: Number(pay.amount_paid || 0),
        entry_type: 'payment',
        invoice_type: null,
        status_text: null,
      })
    }

    ledger.sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''))

    try {
      await admin.from('tenant_archive_events').insert({
        organization_id: orgId,
        tenant_user_id: tenantId,
        actor_user_id: user.id,
        event_type: 'vault_viewed',
        payload: {},
      })
    } catch (eventError) {
      console.warn('[tenant.vault] failed to log event', eventError)
    }

    return NextResponse.json(
      {
        success: true,
        tenant: { ...(profile || {}), email },
        archive,
        leases: leases || [],
        ledger,
        maintenance: maintenance || [],
        maintenanceExpenses: maintExpenses || [],
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[tenant.vault] error', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed.' },
      { status: 500 }
    )
  }
}
