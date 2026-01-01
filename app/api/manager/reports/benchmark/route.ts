import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRange, safePct } from '../utils'

type Row = {
  propertyId: string
  propertyName: string
  billed: number
  collected: number
  collectionRate: number
  arrearsNow: number
  occupancyRate: number
  expenses: number
  noi: number
  noiMargin: number
}

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : null
}

function monthStartIso(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

function isEffectivelyPaid(inv: any) {
  const amount = Number(inv.amount || 0)
  const totalPaid = Number(inv.total_paid || 0)
  const statusText = String(inv.status_text || '').toLowerCase()
  return statusText === 'paid' || totalPaid >= amount - 0.05
}

function isRentPrepaid(inv: any) {
  if (String(inv.invoice_type || '') !== 'rent') return false
  const paidUntil = monthStartIso(inv.lease?.rent_paid_until)
  const periodStart = monthStartIso(inv.period_start || inv.due_date)
  if (!paidUntil || !periodStart) return false
  return paidUntil >= periodStart
}

function monthStartUtc(dateIso: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') || 'year'
    const propertyId = url.searchParams.get('propertyId') || 'all'
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id
    const range = resolveRange({ period, startDate, endDate })
    const scopePropertyId = propertyId !== 'all' ? propertyId : null

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    const propertyMap = new Map((properties || []).map((p: any) => [p.id, p.name || 'Property']))

    let unitQuery = admin
      .from('apartment_units')
      .select('id, status, building_id')
      .eq('organization_id', orgId)
    if (scopePropertyId) unitQuery = unitQuery.eq('building_id', scopePropertyId)
    const { data: units, error: unitErr } = await unitQuery
    if (unitErr) throw unitErr

    const occupancyByProperty = new Map<
      string,
      { total: number; occupiedLike: number }
    >()
    ;(units || []).forEach((unit: any) => {
      if (!unit.building_id) return
      const entry = occupancyByProperty.get(unit.building_id) || { total: 0, occupiedLike: 0 }
      entry.total += 1
      const status = String(unit.status || '').toLowerCase()
      if (status === 'occupied' || status === 'notice') entry.occupiedLike += 1
      occupancyByProperty.set(unit.building_id, entry)
    })

    let invoiceQuery = admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        total_paid,
        status_text,
        due_date,
        period_start,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          rent_paid_until,
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])
      .neq('status_text', 'void')
      .gt('amount', 0)

    if (range.start) {
      invoiceQuery = invoiceQuery.or(
        `and(period_start.gte.${range.start},period_start.lte.${range.end}),and(period_start.is.null,due_date.gte.${range.start},due_date.lte.${range.end})`
      )
    } else {
      invoiceQuery = invoiceQuery.or(
        `period_start.lte.${range.end},and(period_start.is.null,due_date.lte.${range.end})`
      )
    }

    const { data: invoices, error: invErr } = await invoiceQuery
    if (invErr) throw invErr

    const scopedInvoices =
      scopePropertyId
        ? (invoices || []).filter((inv: any) => inv.lease?.unit?.building?.id === scopePropertyId)
        : invoices || []

    let paymentsQuery = admin
      .from('payments')
      .select(
        `
        amount_paid,
        payment_date,
        verified,
        invoice:invoices!payments_invoice_org_fk (
          invoice_type,
          lease:leases!invoices_lease_org_fk (
            unit:apartment_units (
              building:apartment_buildings!apartment_units_building_org_fk ( id, name )
            )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .eq('verified', true)

    if (range.start) paymentsQuery = paymentsQuery.gte('payment_date', range.start)
    paymentsQuery = paymentsQuery.lte('payment_date', range.end)

    const { data: payments, error: payErr } = await paymentsQuery
    if (payErr) throw payErr

    const scopedPayments =
      scopePropertyId
        ? (payments || []).filter((p: any) => p.invoice?.lease?.unit?.building?.id === scopePropertyId)
        : payments || []

    const { data: expensesRaw, error: expensesError } = await admin
      .from('expenses')
      .select('id, amount, incurred_at, created_at, property_id, organization_id')
      .eq('organization_id', orgId)
    if (expensesError) throw expensesError

    const expenses = (expensesRaw || []).filter((item: any) => {
      const date = isoDate(item.incurred_at) || isoDate(item.created_at)
      if (!date) return false
      if (range.start && date < range.start) return false
      return date <= range.end
    })

    const scopedExpenses = scopePropertyId
      ? expenses.filter((item: any) => item.property_id === scopePropertyId)
      : expenses

    const { data: recurringExpenses, error: recurringError } = await admin
      .from('recurring_expenses')
      .select('id, property_id, amount, next_run, active')
      .eq('organization_id', orgId)
      .eq('active', true)
    if (recurringError) throw recurringError

    const recurringEntries: Array<{ property_id: string | null; amount: number; incurred_at: string }> = []
    const rangeStartIso = range.start || range.end
    const startMonth = rangeStartIso ? monthStartUtc(rangeStartIso) : null
    const endMonth = monthStartUtc(range.end)

    if (startMonth && endMonth) {
      for (const recurring of recurringExpenses || []) {
        if (!recurring) continue
        const nextRunIso = recurring.next_run ? String(recurring.next_run).slice(0, 10) : null
        const nextRunMonth = nextRunIso ? monthStartUtc(nextRunIso) : null
        let cursor = nextRunMonth && nextRunMonth > startMonth ? nextRunMonth : startMonth

        while (cursor <= endMonth) {
          recurringEntries.push({
            property_id: recurring.property_id || null,
            amount: Number(recurring.amount || 0),
            incurred_at: cursor.toISOString(),
          })
          cursor = addMonthsUtc(cursor, 1)
        }
      }
    }

    const scopedRecurringEntries = scopePropertyId
      ? recurringEntries.filter((entry) => entry.property_id === scopePropertyId)
      : recurringEntries

    const combinedExpenses = [...scopedExpenses, ...scopedRecurringEntries]

    let arrearsQuery = admin
      .from('invoices')
      .select(
        `
        amount,
        total_paid,
        status_text,
        due_date,
        period_start,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          rent_paid_until,
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])

    const todayIso = new Date().toISOString().slice(0, 10)
    arrearsQuery = arrearsQuery
      .lt('due_date', todayIso)
      .neq('status_text', 'paid')
      .neq('status_text', 'void')

    const { data: arrearsInvoices, error: arrearsErr } = await arrearsQuery
    if (arrearsErr) throw arrearsErr

    const arrearsScoped =
      scopePropertyId
        ? (arrearsInvoices || []).filter((inv: any) => inv.lease?.unit?.building?.id === scopePropertyId)
        : arrearsInvoices || []

    const rowsMap = new Map<string, Row>()
    ;(properties || []).forEach((property: any) => {
      rowsMap.set(property.id, {
        propertyId: property.id,
        propertyName: property.name || 'Property',
        billed: 0,
        collected: 0,
        collectionRate: 0,
        arrearsNow: 0,
        occupancyRate: 0,
        expenses: 0,
        noi: 0,
        noiMargin: 0,
      })
    })

    const ensureRow = (pid: string, name?: string | null) => {
      if (!rowsMap.has(pid)) {
        rowsMap.set(pid, {
          propertyId: pid,
          propertyName: name || propertyMap.get(pid) || 'Property',
          billed: 0,
          collected: 0,
          collectionRate: 0,
          arrearsNow: 0,
          occupancyRate: 0,
          expenses: 0,
          noi: 0,
          noiMargin: 0,
        })
      }
      return rowsMap.get(pid)!
    }

    for (const inv of scopedInvoices) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      row.billed += Number(inv.amount || 0)
    }

    for (const payment of scopedPayments) {
      const pid = payment.invoice?.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, payment.invoice?.lease?.unit?.building?.name)
      row.collected += Number(payment.amount_paid || 0)
    }

    for (const expense of combinedExpenses) {
      const pid = expense.property_id
      if (!pid) continue
      const row = ensureRow(pid, propertyMap.get(pid))
      row.expenses += Number(expense.amount || 0)
    }

    for (const inv of arrearsScoped) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      const amount = Number(inv.amount || 0)
      const outstanding = isEffectivelyPaid(inv) || isRentPrepaid(inv)
        ? 0
        : Math.max(amount - Number(inv.total_paid || 0), 0)
      row.arrearsNow += outstanding
    }

    for (const [pid, entry] of occupancyByProperty.entries()) {
      const row = ensureRow(pid, propertyMap.get(pid))
      row.occupancyRate = entry.total ? safePct(entry.occupiedLike, entry.total) : 0
    }

    const rows = Array.from(rowsMap.values())
      .map((row) => {
        row.collectionRate = safePct(row.collected, row.billed)
        row.noi = row.collected - row.expenses
        row.noiMargin = safePct(row.noi, row.collected)
        return row
      })
      .filter((row) => (scopePropertyId ? row.propertyId === scopePropertyId : true))

    const rateSource = rows.filter((row) => row.billed > 0)
    const rates = (rateSource.length ? rateSource : rows).map((row) => row.collectionRate)
    const medianCollectionRate = median(rates)
    const avgCollectionRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
    const topProperty = rows.length
      ? rows.reduce((best, row) => (row.collectionRate > best.collectionRate ? row : best), rows[0])
      : null
    const bottomProperty = rows.length
      ? rows.reduce((worst, row) => (row.collectionRate < worst.collectionRate ? row : worst), rows[0])
      : null
    const spread =
      topProperty && bottomProperty ? topProperty.collectionRate - bottomProperty.collectionRate : 0
    const underperformers = rows.filter((row) => row.collectionRate < medianCollectionRate).length

    return NextResponse.json({
      success: true,
      data: {
        range,
        properties: properties || [],
        benchmarks: {
          medianCollectionRate,
          avgCollectionRate,
          topProperty: topProperty
            ? { name: topProperty.propertyName, rate: topProperty.collectionRate }
            : null,
          bottomProperty: bottomProperty
            ? { name: bottomProperty.propertyName, rate: bottomProperty.collectionRate }
            : null,
          spread,
          underperformers,
        },
        rows,
      },
    })
  } catch (error) {
    console.error('[BenchmarkReport] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load benchmark report.' },
      { status: 500 }
    )
  }
}
