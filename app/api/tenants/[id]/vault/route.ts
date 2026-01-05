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

type DocumentItem = {
  id?: string | null
  category: string
  label: string
  url: string | null
  created_at?: string | null
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

function extractStoragePath(raw: string | null | undefined, bucket: string) {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = value.indexOf(marker)
  if (idx >= 0) return value.slice(idx + marker.length)
  if (value.startsWith(`${bucket}/`)) return value.slice(bucket.length + 1)
  return value
}

async function signPaths(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  paths: string[]
) {
  const unique = Array.from(new Set(paths.filter(Boolean)))
  if (unique.length === 0) return new Map<string, string>()

  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unique, 60 * 60)
  if (error) {
    console.warn('[tenant.vault] Failed to sign urls', bucket, error)
    return new Map<string, string>()
  }

  const map = new Map<string, string>()
  ;(data || []).forEach((row) => {
    if (row?.path && row?.signedUrl) map.set(row.path, row.signedUrl)
  })
  return map
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
        id, unit_id, start_date, end_date, monthly_rent, deposit_amount, status, created_at, lease_agreement_url,
        unit:apartment_units (
          id, unit_number, status, building_id,
          building:apartment_buildings ( id, name, location )
        )
      `
      )
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })

    const leaseSummaries = (leases || []).map((lease: any) => ({
      id: lease?.id || null,
      unit_id: lease?.unit_id || lease?.unit?.id || null,
      start_date: lease?.start_date || null,
      end_date: lease?.end_date || null,
    }))
    const leaseIds = leaseSummaries.map((lease) => lease.id).filter(Boolean) as string[]
    const unitIds = Array.from(
      new Set(leaseSummaries.map((lease) => lease.unit_id).filter(Boolean) as string[])
    )

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

    let waterBillRows: any[] = []
    if (unitIds.length > 0) {
      const { data: wbRows, error: wbErr } = await admin
        .from('water_bills')
        .select(
          `
          id,
          billing_month,
          amount,
          status,
          units_consumed,
          notes,
          created_at,
          unit:apartment_units!inner (
            id,
            unit_number,
            building_id,
            apartment_buildings ( id, name, location )
          ),
          invoice:invoices (
            id,
            status,
            due_date,
            amount,
            lease_id
          )
        `
        )
        .eq('organization_id', orgId)
        .in('unit_id', unitIds)
        .order('billing_month', { ascending: false })
        .limit(1000)

      if (wbErr) {
        console.error('[tenant.vault] Failed to load water bills', wbErr)
      } else {
        waterBillRows = wbRows || []
      }
    }

    const { data: maintenance } = await admin
      .from('maintenance_requests')
      .select(
        'id, title, description, status, created_at, completed_at, maintenance_cost, maintenance_cost_paid_by, maintenance_cost_notes, unit_id, attachment_urls'
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

    const leaseById = new Map<string, any>()
    const leasesByUnit = new Map<string, any[]>()

    leaseSummaries.forEach((lease) => {
      if (lease.id) leaseById.set(lease.id, lease)
      if (lease.unit_id) {
        const list = leasesByUnit.get(lease.unit_id) || []
        list.push(lease)
        leasesByUnit.set(lease.unit_id, list)
      }
    })

    leasesByUnit.forEach((list) =>
      list.sort((a, b) => {
        const aDate = a.start_date ? new Date(a.start_date).getTime() : 0
        const bDate = b.start_date ? new Date(b.start_date).getTime() : 0
        return bDate - aDate
      })
    )

    const getLeaseForBill = (unitId: string | null, billingMonth: string | null) => {
      if (!unitId) return null
      const candidates = leasesByUnit.get(unitId)
      if (!candidates || candidates.length === 0) return null
      if (!billingMonth) return candidates[0]

      const periodStart = new Date(billingMonth)
      periodStart.setUTCHours(0, 0, 0, 0)
      const periodEnd = new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0)
      )

      return (
        candidates.find((lease) => {
          const leaseStart = lease.start_date ? new Date(lease.start_date) : null
          const leaseEnd = lease.end_date ? new Date(lease.end_date) : null
          if (leaseStart && leaseStart > periodEnd) return false
          if (leaseEnd && leaseEnd < periodStart) return false
          return true
        }) || candidates[0]
      )
    }

    const waterBills = (waterBillRows || [])
      .map((row: any) => {
        const invoice = row.invoice
        const leaseFromInvoice = invoice?.lease_id ? leaseById.get(invoice.lease_id) : null
        const leaseFromUnit = getLeaseForBill(row.unit?.id || row.unit_id || null, row.billing_month)
        const lease = leaseFromInvoice || leaseFromUnit
        if (!lease) return null
        if (lease.id && !leaseById.has(lease.id)) return null

        const building = row.unit?.apartment_buildings
        const status = invoice ? (invoice.status ? 'paid' : 'unpaid') : row.status || 'unpaid'

        return {
          id: row.id,
          billing_month: row.billing_month,
          amount: Number(row.amount || 0),
          units_consumed: row.units_consumed ? Number(row.units_consumed) : null,
          notes: row.notes,
          created_at: row.created_at,
          property_id: building?.id || row.unit?.building_id || null,
          property_name: building?.name || 'Unassigned',
          property_location: building?.location || '—',
          unit_id: row.unit?.id || row.unit_id || null,
          unit_number: row.unit?.unit_number || '—',
          invoice_due_date: invoice?.due_date || null,
          invoice_id: invoice?.id || null,
          status,
        }
      })
      .filter(Boolean)

    let messages: any[] = []
    try {
      let staffIds: string[] = [user.id]
      const { data: staff } = await admin
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
        .in('role', Array.from(VIEW_ROLES))
      const ids = (staff || []).map((row: any) => row.user_id).filter(Boolean)
      staffIds = Array.from(new Set([...staffIds, ...ids]))

      const staffList = staffIds.map((id) => id.replace(/,/g, '')).join(',')
      if (staffList) {
        const { data: messageRows } = await admin
          .from('communications')
          .select(
            'id, sender_user_id, recipient_user_id, message_text, message_type, related_entity_type, related_entity_id, read, created_at'
          )
          .or(
            `and(sender_user_id.in.(${staffList}),recipient_user_id.eq.${tenantId}),and(sender_user_id.eq.${tenantId},recipient_user_id.in.(${staffList}))`
          )
          .order('created_at', { ascending: true })

        const seenTenantMessages = new Set<string>()
        messages = (messageRows || []).filter((msg) => {
          if (msg.sender_user_id !== tenantId) return true
          const createdAtMs = msg.created_at ? Date.parse(msg.created_at) : 0
          const timeBucket = Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 10_000) : 0
          const key = [
            msg.message_text || '',
            msg.message_type || '',
            msg.related_entity_type || '',
            msg.related_entity_id || '',
            timeBucket.toString(),
          ].join('|')
          if (seenTenantMessages.has(key)) return false
          seenTenantMessages.add(key)
          return true
        })
      }
    } catch (msgError) {
      console.warn('[tenant.vault] Failed to load messages', msgError)
      messages = []
    }

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

    const { data: transitionCases } = await admin
      .from('tenant_transition_cases')
      .select('id, notice_document_url, inspection_report_url, settlement_statement_url, created_at')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)

    const { data: vacateNotices } = await admin
      .from('tenant_vacate_notices')
      .select('id, notice_document_url, created_at')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)

    const { data: renewalRows } = await admin
      .from('lease_renewals')
      .select('id, lease_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path, created_at')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)

    const leaseDocPaths = (leases || [])
      .map((row: any) => extractStoragePath(row.lease_agreement_url, 'lease-documents'))
      .filter(Boolean) as string[]
    const maintenanceDocPaths = (maintenance || [])
      .flatMap((row: any) => row.attachment_urls || [])
      .map((path: string) => extractStoragePath(path, 'maintenance-attachments'))
      .filter(Boolean) as string[]
    const transitionDocPaths = (transitionCases || [])
      .flatMap((row: any) => [
        row.notice_document_url,
        row.inspection_report_url,
        row.settlement_statement_url,
      ])
      .map((path: string) => extractStoragePath(path, 'tenant-transitions'))
      .filter(Boolean) as string[]
    const vacateNoticePaths = (vacateNotices || [])
      .map((row: any) => extractStoragePath(row.notice_document_url, 'tenant-notices'))
      .filter(Boolean) as string[]
    const renewalPaths = (renewalRows || [])
      .flatMap((row: any) => [row.pdf_unsigned_path, row.pdf_tenant_signed_path, row.pdf_fully_signed_path])
      .filter(Boolean) as string[]

    const leaseUrlMap = await signPaths(admin, 'lease-documents', leaseDocPaths)
    const maintenanceUrlMap = await signPaths(admin, 'maintenance-attachments', maintenanceDocPaths)
    const transitionUrlMap = await signPaths(admin, 'tenant-transitions', transitionDocPaths)
    const vacateUrlMap = await signPaths(admin, 'tenant-notices', vacateNoticePaths)
    const renewalUrlMap = await signPaths(admin, 'lease-renewals', renewalPaths)

    const documents: DocumentItem[] = []

    ;(leases || []).forEach((lease: any) => {
      const raw = lease.lease_agreement_url
      if (!raw) return
      const path = extractStoragePath(raw, 'lease-documents')
      const url = path ? leaseUrlMap.get(path) || raw : raw
      documents.push({
        id: lease.id,
        category: 'lease',
        label: 'Lease agreement',
        url,
        created_at: lease.start_date || lease.created_at || null,
      })
    })

    ;(maintenance || []).forEach((request: any) => {
      const attachments = request.attachment_urls || []
      attachments.forEach((raw: string) => {
        const path = extractStoragePath(raw, 'maintenance-attachments')
        const url = path ? maintenanceUrlMap.get(path) || raw : raw
        documents.push({
          id: request.id,
          category: 'maintenance',
          label: request.title ? `Maintenance attachment - ${request.title}` : 'Maintenance attachment',
          url,
          created_at: request.created_at || null,
        })
      })
    })

    ;(transitionCases || []).forEach((row: any) => {
      const entries = [
        { raw: row.notice_document_url, label: 'Transition notice' },
        { raw: row.inspection_report_url, label: 'Inspection report' },
        { raw: row.settlement_statement_url, label: 'Settlement statement' },
      ]
      entries.forEach((entry) => {
        if (!entry.raw) return
        const path = extractStoragePath(entry.raw, 'tenant-transitions')
        const url = path ? transitionUrlMap.get(path) || entry.raw : entry.raw
        documents.push({
          id: row.id,
          category: 'transition',
          label: entry.label,
          url,
          created_at: row.created_at || null,
        })
      })
    })

    ;(vacateNotices || []).forEach((row: any) => {
      if (!row.notice_document_url) return
      const path = extractStoragePath(row.notice_document_url, 'tenant-notices')
      const url = path ? vacateUrlMap.get(path) || row.notice_document_url : row.notice_document_url
      documents.push({
        id: row.id,
        category: 'vacate_notice',
        label: 'Vacate notice',
        url,
        created_at: row.created_at || null,
      })
    })

    ;(renewalRows || []).forEach((row: any) => {
      const entries = [
        { raw: row.pdf_unsigned_path, label: 'Renewal - unsigned' },
        { raw: row.pdf_tenant_signed_path, label: 'Renewal - tenant signed' },
        { raw: row.pdf_fully_signed_path, label: 'Renewal - fully signed' },
      ]
      entries.forEach((entry) => {
        if (!entry.raw) return
        const path = extractStoragePath(entry.raw, 'lease-renewals')
        const url = path ? renewalUrlMap.get(path) || entry.raw : entry.raw
        documents.push({
          id: row.id,
          category: 'lease_renewal',
          label: entry.label,
          url,
          created_at: row.created_at || null,
        })
      })
    })

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
        waterBills,
        messages,
        documents,
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
