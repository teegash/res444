import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ImportKind = 'invoice' | 'payment' | 'maintenance'

type ImportRow = {
  rowIndex: number
  kind: ImportKind

  invoice_type?: 'rent' | 'water'
  period_start?: string
  due_date?: string
  amount?: number
  paid?: 'YES' | 'NO'
  description?: string
  notes?: string

  amount_paid?: number
  payment_date?: string
  payment_method?: 'mpesa' | 'bank_transfer' | 'cash' | 'cheque'
  mpesa_receipt_number?: string
  bank_reference_number?: string
  verified?: boolean
  payment_notes?: string

  request_date?: string
  title?: string
  maintenance_description?: string
  priority_level?: 'low' | 'medium' | 'high' | 'urgent'
  maintenance_cost?: number
  maintenance_cost_paid_by?: 'tenant' | 'manager'
  maintenance_cost_notes?: string
  assigned_technician_name?: string
  assigned_technician_phone?: string
}

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])

function sha256Hex(input: string) {
  // Using Web Crypto is awkward in Node route; keep simple deterministic hash-like string
  // This is sufficient for dedupe in combination with unique constraint.
  // If you prefer crypto module, you can switch to node:crypto.
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return `${hash.toString(16)}-${input.length}`
}

function toIsoAtNoonEAT(dateYYYYMMDD: string) {
  // Prevent timezone drift: store as noon in +03:00 on that calendar date
  return `${dateYYYYMMDD}T12:00:00+03:00`
}

function toDateOnlyIso(raw: string) {
  if (!raw) return null
  if (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    let tenantId =
      ctx?.params?.id ||
      req.nextUrl.searchParams.get('tenantId') ||
      req.nextUrl.searchParams.get('id') ||
      null

    if (!tenantId) {
      const segments = req.nextUrl.pathname.split('/').filter(Boolean)
      const tenantsIndex = segments.indexOf('tenants')
      if (tenantsIndex >= 0 && segments[tenantsIndex + 1]) {
        tenantId = segments[tenantsIndex + 1]
      } else if (segments.length >= 2 && segments[segments.length - 1] === 'import-past-data') {
        tenantId = segments[segments.length - 2]
      }
    }

    tenantId = String(tenantId || '').trim()
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

    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ success: false, error: 'rows[] required' }, { status: 400 })
    }

    const fileName = body.file_name ? String(body.file_name) : null
    const rows: ImportRow[] = body.rows

    if (rows.length < 1) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 })
    }
    if (rows.length > 200) {
      return NextResponse.json({ success: false, error: 'Max 200 rows per request' }, { status: 413 })
    }

    const admin = createAdminClient()

    // Resolve caller org + role
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const orgId = membership?.organization_id || null
    const role = membership?.role ? String(membership.role).toLowerCase() : null

    if (!orgId || !role || !MANAGER_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Confirm tenant profile belongs to org (and is tenant)
    const { data: tenantProfile } = await admin
      .from('user_profiles')
      .select('id, organization_id, role')
      .eq('id', tenantId)
      .maybeSingle()

    if (!tenantProfile || tenantProfile.organization_id !== orgId || tenantProfile.role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Tenant not found in your organization.' }, { status: 404 })
    }

    // Resolve latest lease for tenant (used for invoices + maintenance)
    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, organization_id, tenant_user_id, start_date, end_date, status, unit_id')
      .eq('organization_id', orgId)
      .eq('tenant_user_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseErr || !lease?.id || !lease.unit_id) {
      return NextResponse.json({ success: false, error: 'Tenant lease not found.' }, { status: 404 })
    }

    // Create batch (audit)
    const { data: batch, error: bErr } = await admin
      .from('tenant_past_data_import_batches')
      .insert({
        organization_id: orgId,
        tenant_user_id: tenantId,
        lease_id: lease.id,
        created_by: user.id,
        file_name: fileName,
        status: 'processing',
      })
      .select('id')
      .single()

    if (bErr || !batch?.id) {
      return NextResponse.json({ success: false, error: 'Failed to create import batch.' }, { status: 500 })
    }

    // Sort: invoices -> payments -> maintenance (ensures invoices exist before payments)
    const sorted = [...rows].sort((a, b) => {
      const rank = (k?: string) => (k === 'invoice' ? 1 : k === 'payment' ? 2 : 3)
      return rank(a.kind) - rank(b.kind)
    })

    const results: Array<{ rowIndex: number; status: 'inserted' | 'skipped' | 'failed'; message?: string }> = []

    let insertedCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const r of sorted) {
      const kind = r.kind
      const rowIndex = Number(r.rowIndex || 0)

      // Build row_hash for idempotency
      const hashBasis =
        kind === 'invoice'
          ? `inv|${orgId}|${tenantId}|${lease.id}|${r.invoice_type}|${r.period_start}|${r.due_date}|${r.amount}|${r.paid}`
          : kind === 'payment'
          ? `pay|${orgId}|${tenantId}|${lease.id}|${r.invoice_type}|${r.period_start}|${r.amount_paid}|${r.payment_date}|${r.payment_method}|${r.mpesa_receipt_number || ''}|${r.bank_reference_number || ''}`
          : `mnt|${orgId}|${tenantId}|${lease.id}|${r.request_date}|${r.title}|${r.maintenance_cost}|${r.maintenance_cost_paid_by}`

      const rowHash = sha256Hex(hashBasis)

      // Insert import row record (dedupe)
      const insertRow = await admin
        .from('tenant_past_data_import_rows')
        .insert({
          organization_id: orgId,
          batch_id: batch.id,
          row_index: rowIndex,
          row_hash: rowHash,
          kind,
          payload: r,
          status: 'pending',
        })
        .select('id')
        .single()

      if (insertRow.error || !insertRow.data?.id) {
        // unique conflict => already imported before
        skippedCount++
        results.push({
          rowIndex,
          status: 'skipped',
          message: 'Skipped duplicate row (already imported earlier).',
        })
        continue
      }

      const importRowId = insertRow.data.id

      try {
        if (kind === 'invoice') {
          const invoiceType = r.invoice_type
          const periodStart = r.period_start
          const dueDate = r.due_date
          const amount = Number(r.amount || 0)
          const paid = r.paid

          if (!invoiceType || !periodStart || !dueDate || amount <= 0 || !paid) {
            throw new Error('Invalid invoice row.')
          }

          // Upsert invoice (unique lease_id + invoice_type + period_start)
          // Keep unpaid initially; payment will finalize paid invoices.
          const { data: upserted, error: upErr } = await admin
            .from('invoices')
            .upsert(
              {
                organization_id: orgId,
                lease_id: lease.id,
                invoice_type: invoiceType,
                amount,
                due_date: dueDate,
                period_start: periodStart,
                description: r.description || null,
                notes: r.notes || null,
                status_text: 'unpaid',
                status: false,
              },
              { onConflict: 'lease_id,invoice_type,period_start' }
            )
            .select('id')
            .single()

          if (upErr || !upserted?.id) throw new Error('Failed to upsert invoice.')

          await admin
            .from('tenant_past_data_import_rows')
            .update({ status: 'inserted', created_invoice_id: upserted.id })
            .eq('id', importRowId)

          insertedCount++
          results.push({ rowIndex, status: 'inserted', message: 'Invoice imported.' })
          continue
        }

        if (kind === 'payment') {
          const invoiceType = r.invoice_type
          const periodStart = r.period_start
          const paymentDateRaw = String(r.payment_date || '').trim()
          const amountPaid = Number(r.amount_paid || 0)
          const paymentMethod = r.payment_method

          if (!invoiceType || !periodStart || !paymentDateRaw || amountPaid <= 0 || !paymentMethod) {
            throw new Error('Invalid payment row.')
          }

          // Find invoice
          const { data: invoice, error: invErr } = await admin
            .from('invoices')
            .select('id, amount, status_text')
            .eq('organization_id', orgId)
            .eq('lease_id', lease.id)
            .eq('invoice_type', invoiceType)
            .eq('period_start', periodStart)
            .maybeSingle()

          if (invErr || !invoice?.id) {
            throw new Error(`Invoice not found for payment (type=${invoiceType}, period_start=${periodStart}).`)
          }

          // Enforce NO partial / single payment:
          // 1) invoice must be fully matched in amount
          if (Number(invoice.amount) !== Number(amountPaid)) {
            throw new Error(`Payment amount must equal invoice amount (${invoice.amount}). Partial payments are not allowed.`)
          }

          // 2) invoice must not already have a payment in DB
          const { count: existingCount, error: countErr } = await admin
            .from('payments')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('invoice_id', invoice.id)

          if (countErr) throw new Error('Failed checking existing payments.')
          if ((existingCount ?? 0) > 0) {
            throw new Error('Invoice already has a payment in DB. Partial/multiple payments are not allowed.')
          }

          const verified = r.verified !== false

          const paymentDateIso = paymentDateRaw.length === 10 ? toIsoAtNoonEAT(paymentDateRaw) : paymentDateRaw
          const invoicePaymentDate = toDateOnlyIso(paymentDateIso) || toDateOnlyIso(paymentDateRaw)

          const { data: payment, error: pErr } = await admin
            .from('payments')
            .insert({
              organization_id: orgId,
              invoice_id: invoice.id,
              tenant_user_id: tenantId,
              amount_paid: amountPaid,
              payment_date: paymentDateIso,
              payment_method: paymentMethod,
              mpesa_receipt_number: r.mpesa_receipt_number || null,
              bank_reference_number: r.bank_reference_number || null,
              verified,
              verified_by: verified ? user.id : null,
              verified_at: verified ? new Date().toISOString() : null,
              notes: r.payment_notes || 'Imported historical payment',
            })
            .select('id')
            .single()

          if (pErr || !payment?.id) throw new Error('Failed to insert payment.')

          // Mark invoice as paid (trigger will recompute total_paid)
          const invoiceUpdate: { status_text: string; status: boolean; payment_date?: string } = {
            status_text: 'paid',
            status: true,
          }
          if (invoicePaymentDate) invoiceUpdate.payment_date = invoicePaymentDate

          await admin
            .from('invoices')
            .update(invoiceUpdate)
            .eq('organization_id', orgId)
            .eq('id', invoice.id)

          await admin
            .from('tenant_past_data_import_rows')
            .update({ status: 'inserted', created_payment_id: payment.id })
            .eq('id', importRowId)

          insertedCount++
          results.push({ rowIndex, status: 'inserted', message: 'Payment imported (invoice paid).' })
          continue
        }

        if (kind === 'maintenance') {
          const requestDate = String(r.request_date || '').trim()
          const title = String(r.title || '').trim()
          const desc = String(r.maintenance_description || '').trim()
          const priority = String(r.priority_level || '').trim()
          const cost = Number(r.maintenance_cost ?? 0)
          const paidBy = String(r.maintenance_cost_paid_by || '').trim()

          if (!requestDate || !title || !desc) {
            throw new Error('Invalid maintenance row (missing request_date/title/description).')
          }
          if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new Error('Invalid priority_level.')
          if (!['tenant', 'manager'].includes(paidBy)) throw new Error('Invalid maintenance_cost_paid_by.')
          if (!Number.isFinite(cost) || cost < 0) throw new Error('maintenance_cost must be >= 0.')

          const createdIso = toIsoAtNoonEAT(requestDate)

          const { data: mr, error: mrErr } = await admin
            .from('maintenance_requests')
            .insert({
              organization_id: orgId,
              unit_id: lease.unit_id,
              tenant_user_id: tenantId,
              title,
              description: desc,
              priority_level: priority,
              status: 'completed',
              created_at: createdIso,
              completed_at: createdIso,
              maintenance_cost: cost,
              maintenance_cost_paid_by: paidBy,
              maintenance_cost_notes: r.maintenance_cost_notes || null,
              assigned_technician_name: r.assigned_technician_name || null,
              assigned_technician_phone: r.assigned_technician_phone || null,
            })
            .select('id')
            .single()

          if (mrErr || !mr?.id) throw new Error('Failed to insert maintenance request.')

          await admin
            .from('tenant_past_data_import_rows')
            .update({ status: 'inserted', created_maintenance_id: mr.id })
            .eq('id', importRowId)

          insertedCount++
          results.push({ rowIndex, status: 'inserted', message: 'Maintenance imported (completed same day).' })
          continue
        }

        throw new Error('Unknown row kind.')
      } catch (e: any) {
        failedCount++
        await admin
          .from('tenant_past_data_import_rows')
          .update({ status: 'failed', error: e?.message || 'Failed' })
          .eq('id', importRowId)

        results.push({ rowIndex, status: 'failed', message: e?.message || 'Failed' })
      }
    }

    await admin
      .from('tenant_past_data_import_batches')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        summary: {
          inserted: insertedCount,
          skipped: skippedCount,
          failed: failedCount,
          received: rows.length,
        },
      })
      .eq('id', batch.id)

    return NextResponse.json({ success: true, results }, { status: 200 })
  } catch (e: any) {
    console.error('[tenants/import-past-data] error', e)
    return NextResponse.json({ success: false, error: e?.message || 'Import failed' }, { status: 500 })
  }
}
