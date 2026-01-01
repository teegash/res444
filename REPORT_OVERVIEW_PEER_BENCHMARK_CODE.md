# Report Overview + Peer Benchmark Code (Current)

Entry points:
- `app/dashboard/manager/reports/page.tsx`
- `app/api/manager/reports/overview/route.ts`
- `app/dashboard/manager/reports/benchmark/page.tsx`
- `app/api/manager/reports/benchmark/route.ts`

The files below are the current sources for those pages, their API routes, and their in-repo dependencies.

## `app/api/manager/reports/benchmark/route.ts`

```ts
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
  unitCount: number
  occupiedLikeCount: number
}

function isoDate(value: string | null | undefined) {
  if (!value) return null
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : null
}

function clampMoney(value: unknown) {
  const v = Number(value || 0)
  if (!Number.isFinite(v)) return 0
  return v
}

function pickInvoiceDate(inv: any) {
  return isoDate(inv.period_start) || isoDate(inv.due_date)
}

function inRange(dateIso: string | null, start: string | null, end: string) {
  if (!dateIso) return false
  if (start && dateIso < start) return false
  return dateIso <= end
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

    const occupancyByProperty = new Map<string, { total: number; occupiedLike: number }>()
    ;(units || []).forEach((u: any) => {
      const pid = u.building_id
      if (!pid) return
      const entry = occupancyByProperty.get(pid) || { total: 0, occupiedLike: 0 }
      entry.total += 1
      const status = String(u.status || '').toLowerCase()
      if (status === 'occupied' || status === 'notice') entry.occupiedLike += 1
      occupancyByProperty.set(pid, entry)
    })

    const rowsMap = new Map<string, Row>()
    ;(properties || []).forEach((p: any) => {
      rowsMap.set(p.id, {
        propertyId: p.id,
        propertyName: p.name || 'Property',
        billed: 0,
        collected: 0,
        collectionRate: 0,
        arrearsNow: 0,
        occupancyRate: 0,
        expenses: 0,
        noi: 0,
        noiMargin: 0,
        unitCount: 0,
        occupiedLikeCount: 0,
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
          unitCount: 0,
          occupiedLikeCount: 0,
        })
      }
      return rowsMap.get(pid)!
    }

    const { data: invoicesRaw, error: invErr } = await admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        status_text,
        due_date,
        period_start,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
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

    if (invErr) throw invErr

    const invoices = (invoicesRaw || []).filter((inv: any) => {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) return false
      if (scopePropertyId && pid !== scopePropertyId) return false
      const date = pickInvoiceDate(inv)
      return inRange(date, range.start, range.end)
    })

    for (const inv of invoices) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      row.billed += clampMoney(inv.amount)
    }

    let payQuery = admin
      .from('payments')
      .select(
        `
        amount_paid,
        payment_date,
        verified,
        invoice:invoices!payments_invoice_org_fk (
          invoice_type,
          status_text,
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

    if (range.start) payQuery = payQuery.gte('payment_date', range.start)
    payQuery = payQuery.lte('payment_date', range.end)

    const { data: paymentsRaw, error: payErr } = await payQuery
    if (payErr) throw payErr

    const payments = (paymentsRaw || []).filter((p: any) => {
      const pid = p.invoice?.lease?.unit?.building?.id
      if (!pid) return false
      if (scopePropertyId && pid !== scopePropertyId) return false
      const type = String(p.invoice?.invoice_type || '')
      if (type !== 'rent' && type !== 'water') return false
      if (String(p.invoice?.status_text || '').toLowerCase() === 'void') return false
      return true
    })

    for (const p of payments) {
      const pid = p.invoice?.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, p.invoice?.lease?.unit?.building?.name)
      row.collected += clampMoney(p.amount_paid)
    }

    const { data: expensesRaw, error: expErr } = await admin
      .from('expenses')
      .select('id, amount, incurred_at, created_at, property_id')
      .eq('organization_id', orgId)

    if (expErr) throw expErr

    const expenses = (expensesRaw || []).filter((e: any) => {
      const pid = e.property_id
      if (!pid) return false
      if (scopePropertyId && pid !== scopePropertyId) return false
      const date = isoDate(e.incurred_at) || isoDate(e.created_at)
      return inRange(date, range.start, range.end)
    })

    for (const e of expenses) {
      const pid = e.property_id
      if (!pid) continue
      const row = ensureRow(pid, propertyMap.get(pid))
      row.expenses += clampMoney(e.amount)
    }

    const todayIso = new Date().toISOString().slice(0, 10)

    const { data: arrearsRaw, error: arrearsErr } = await admin
      .from('invoices')
      .select(
        `
        amount,
        total_paid,
        status_text,
        due_date,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])
      .lt('due_date', todayIso)
      .neq('status_text', 'paid')
      .neq('status_text', 'void')

    if (arrearsErr) throw arrearsErr

    const arrears = (arrearsRaw || []).filter((inv: any) => {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) return false
      if (scopePropertyId && pid !== scopePropertyId) return false
      return true
    })

    for (const inv of arrears) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      const amount = clampMoney(inv.amount)
      const paid = clampMoney(inv.total_paid)
      row.arrearsNow += Math.max(amount - paid, 0)
    }

    for (const [pid, occ] of occupancyByProperty.entries()) {
      const row = ensureRow(pid, propertyMap.get(pid))
      row.unitCount = occ.total
      row.occupiedLikeCount = occ.occupiedLike
      row.occupancyRate = occ.total ? safePct(occ.occupiedLike, occ.total) : 0
    }

    const rows = Array.from(rowsMap.values())
      .map((r) => {
        r.collectionRate = safePct(r.collected, r.billed)
        r.noi = r.collected - r.expenses
        r.noiMargin = safePct(r.noi, r.collected)
        return r
      })
      .filter((r) => (scopePropertyId ? r.propertyId === scopePropertyId : true))

    const rates = rows.filter((r) => r.billed > 0).map((r) => r.collectionRate)
    const ratesForStats = rates.length ? rates : rows.map((r) => r.collectionRate)

    const median = (vals: number[]) => {
      if (!vals.length) return 0
      const s = [...vals].sort((a, b) => a - b)
      const m = Math.floor(s.length / 2)
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
    }

    const medianCollectionRate = median(ratesForStats)
    const avgCollectionRate = ratesForStats.length
      ? ratesForStats.reduce((a, b) => a + b, 0) / ratesForStats.length
      : 0

    const topProperty =
      rows.length ? rows.reduce((best, r) => (r.collectionRate > best.collectionRate ? r : best), rows[0]) : null
    const bottomProperty =
      rows.length ? rows.reduce((worst, r) => (r.collectionRate < worst.collectionRate ? r : worst), rows[0]) : null

    const spread = topProperty && bottomProperty ? topProperty.collectionRate - bottomProperty.collectionRate : 0
    const underperformers = rows.filter((r) => r.collectionRate < medianCollectionRate).length

    return NextResponse.json({
      success: true,
      data: {
        range,
        properties: properties || [],
        benchmarks: {
          medianCollectionRate,
          avgCollectionRate,
          topProperty: topProperty ? { name: topProperty.propertyName, rate: topProperty.collectionRate } : null,
          bottomProperty: bottomProperty ? { name: bottomProperty.propertyName, rate: bottomProperty.collectionRate } : null,
          spread,
          underperformers,
        },
        rows,
      },
    })
  } catch (error) {
    console.error('[PropertyReport] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load property report.' },
      { status: 500 }
    )
  }
}
```

## `app/api/manager/reports/overview/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bucketKey, defaultGroupBy, resolveRange, safePct } from '../utils'

type GroupBy = 'day' | 'week' | 'month'

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
  const periodStart = monthStartIso(inv.period_start)
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') || 'quarter'
    const propertyId = url.searchParams.get('propertyId') || 'all'
    const groupByParam = (url.searchParams.get('groupBy') || '') as GroupBy | ''
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
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Admin client not configured.' }, { status: 500 })
    }

    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[Reports.Overview] membership lookup failed', membershipError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    const orgId = membership?.organization_id
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const range = resolveRange({ period, startDate, endDate })
    const groupBy: GroupBy = groupByParam || defaultGroupBy(range.start, range.end)

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    const scopePropertyId = propertyId !== 'all' ? propertyId : null

    let unitsQuery = admin
      .from('apartment_units')
      .select('id, status, building_id')
      .eq('organization_id', orgId)

    if (scopePropertyId) unitsQuery = unitsQuery.eq('building_id', scopePropertyId)

    const { data: units, error: unitsErr } = await unitsQuery
    if (unitsErr) throw unitsErr

    const unitStatusCounts = (units || []).reduce((acc: Record<string, number>, unit: any) => {
      const status = String(unit.status || 'unknown')
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})

    const totalUnits = (units || []).length
    const occupiedLike = (unitStatusCounts['occupied'] || 0) + (unitStatusCounts['notice'] || 0)
    const occupancyRate = safePct(occupiedLike, totalUnits)

    let invoiceQuery = admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        total_paid,
        invoice_type,
        status_text,
        due_date,
        period_start,
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

    if (range.start) invoiceQuery = invoiceQuery.gte('period_start', range.start)
    invoiceQuery = invoiceQuery.lte('period_start', range.end)

    const { data: invoices, error: invErr } = await invoiceQuery
    if (invErr) throw invErr

    const scopedInvoices =
      scopePropertyId
        ? (invoices || []).filter((i: any) => i.lease?.unit?.building?.id === scopePropertyId)
        : invoices || []

    let paymentQuery = admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        verified,
        payment_date,
        invoice:invoices!payments_invoice_org_fk (
          id,
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

    if (range.start) paymentQuery = paymentQuery.gte('payment_date', range.start)
    paymentQuery = paymentQuery.lte('payment_date', range.end)

    const { data: payments, error: payErr } = await paymentQuery
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

    if (recurringError) {
      throw recurringError
    }

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
      ? recurringEntries.filter((item) => item.property_id === scopePropertyId)
      : recurringEntries
    const combinedExpenses = [...scopedExpenses, ...scopedRecurringEntries]

    const billed = scopedInvoices.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
    const collected = scopedPayments.reduce((sum: number, row: any) => sum + Number(row.amount_paid || 0), 0)
    const totalExpenses = combinedExpenses.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
    const net = collected - totalExpenses
    const collectionRate = safePct(collected, billed)

    const todayIso = new Date().toISOString().slice(0, 10)
    const arrearsNow = scopedInvoices
      .filter(
        (inv: any) =>
          String(inv.status_text || '').toLowerCase() !== 'paid' &&
          isoDate(inv.due_date) &&
          (isoDate(inv.due_date) as string) < todayIso
      )
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)

    const defaultersCount = scopedInvoices.filter((inv: any) => {
      const overdue = isoDate(inv.due_date) ? (isoDate(inv.due_date) as string) < todayIso : false
      const unpaid = String(inv.status_text || '').toLowerCase() !== 'paid'
      return inv.invoice_type === 'rent' && overdue && unpaid
    }).length

    const series: Record<
      string,
      { period: string; billed: number; unpaid: number; collected: number; expenses: number; net: number }
    > = {}

    for (const inv of scopedInvoices) {
      const d = isoDate(inv.period_start)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, unpaid: 0, collected: 0, expenses: 0, net: 0 }
      const amount = Number(inv.amount || 0)
      const unpaidAmount = isEffectivelyPaid(inv) || isRentPrepaid(inv)
        ? 0
        : Math.max(amount - Number(inv.total_paid || 0), 0)
      series[key].billed += amount
      series[key].unpaid += unpaidAmount
    }

    for (const payment of scopedPayments) {
      const d = isoDate(payment.payment_date)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, unpaid: 0, collected: 0, expenses: 0, net: 0 }
      series[key].collected += Number(payment.amount_paid || 0)
    }

    for (const expense of combinedExpenses) {
      const d = isoDate(expense.incurred_at) || isoDate(expense.created_at)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, unpaid: 0, collected: 0, expenses: 0, net: 0 }
      series[key].expenses += Number(expense.amount || 0)
    }

    Object.values(series).forEach((row) => {
      row.net = row.collected - row.expenses
    })
    const timeseries = Object.values(series).sort((a, b) => a.period.localeCompare(b.period))

    const byProperty: Record<
      string,
      {
        propertyId: string
        propertyName: string
        billed: number
        collected: number
        expenses: number
        net: number
        arrearsNow: number
        collectionRate: number
      }
    > = {}

    const propNameById = new Map((properties || []).map((p: any) => [p.id, p.name]))

    for (const inv of scopedInvoices) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      byProperty[pid] ||= {
        propertyId: pid,
        propertyName: propNameById.get(pid) || 'Property',
        billed: 0,
        collected: 0,
        expenses: 0,
        net: 0,
        arrearsNow: 0,
        collectionRate: 0,
      }
      byProperty[pid].billed += Number(inv.amount || 0)

      const overdue = isoDate(inv.due_date) ? (isoDate(inv.due_date) as string) < todayIso : false
      const unpaid = String(inv.status_text || '').toLowerCase() !== 'paid'
      if (overdue && unpaid) {
        byProperty[pid].arrearsNow += Number(inv.amount || 0)
      }
    }

    for (const payment of scopedPayments) {
      const pid = payment.invoice?.lease?.unit?.building?.id
      if (!pid) continue
      byProperty[pid] ||= {
        propertyId: pid,
        propertyName: propNameById.get(pid) || 'Property',
        billed: 0,
        collected: 0,
        expenses: 0,
        net: 0,
        arrearsNow: 0,
        collectionRate: 0,
      }
      byProperty[pid].collected += Number(payment.amount_paid || 0)
    }

    for (const expense of combinedExpenses) {
      const pid = expense.property_id
      if (!pid) continue
      byProperty[pid] ||= {
        propertyId: pid,
        propertyName: propNameById.get(pid) || 'Property',
        billed: 0,
        collected: 0,
        expenses: 0,
        net: 0,
        arrearsNow: 0,
        collectionRate: 0,
      }
      byProperty[pid].expenses += Number(expense.amount || 0)
    }

    const propertyRows = Object.values(byProperty)
      .map((row) => {
        row.net = row.collected - row.expenses
        row.collectionRate = safePct(row.collected, row.billed)
        return row
      })
      .sort((a, b) => b.collected - a.collected)

    const monthKey = range.end.slice(0, 7)
    const [yearStr, monthStr] = monthKey.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const nextMonth = new Date(Date.UTC(year, month, 1))
    const unitIdsForScope = scopePropertyId ? (units || []).map((unit: any) => unit.id) : null

    let maintenanceRows: Array<{ created_at: string | null; unit_id: string | null }> = []

    if (!scopePropertyId || unitIdsForScope.length) {
      let maintenanceQuery = admin
        .from('maintenance_requests')
        .select('created_at, unit_id')
        .eq('organization_id', orgId)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonth.toISOString())

      if (unitIdsForScope?.length) {
        maintenanceQuery = maintenanceQuery.in('unit_id', unitIdsForScope)
      }

      const { data: maintenanceData, error: maintenanceError } = await maintenanceQuery
      if (maintenanceError) throw maintenanceError
      maintenanceRows = maintenanceData || []
    }

    const maintenanceCounts = new Map<string, number>()
    maintenanceRows.forEach((row) => {
      const day = isoDate(row.created_at)
      if (!day) return
      maintenanceCounts.set(day, (maintenanceCounts.get(day) || 0) + 1)
    })

    const maintenanceData: Array<[string, number]> = []
    const cursor = new Date(monthStart)
    while (cursor < nextMonth) {
      const day = cursor.toISOString().slice(0, 10)
      maintenanceData.push([day, maintenanceCounts.get(day) || 0])
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    const maintenanceMax = maintenanceData.reduce((max, row) => Math.max(max, row[1]), 0)
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const nextYear = new Date(Date.UTC(year + 1, 0, 1))
    let maintenanceYearRows: Array<{ created_at: string | null; unit_id: string | null }> = []

    if (!scopePropertyId || unitIdsForScope.length) {
      let maintenanceYearQuery = admin
        .from('maintenance_requests')
        .select('created_at, unit_id')
        .eq('organization_id', orgId)
        .gte('created_at', yearStart.toISOString())
        .lt('created_at', nextYear.toISOString())

      if (unitIdsForScope?.length) {
        maintenanceYearQuery = maintenanceYearQuery.in('unit_id', unitIdsForScope)
      }

      const { data: yearData, error: yearError } = await maintenanceYearQuery
      if (yearError) throw yearError
      maintenanceYearRows = yearData || []
    }

    const monthCounts = new Map<string, number>()
    maintenanceYearRows.forEach((row) => {
      const day = isoDate(row.created_at)
      if (!day) return
      const monthKey = day.slice(0, 7)
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1)
    })

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const maintenanceMonths = monthNames.map((label, index) => {
      const key = `${yearStr}-${String(index + 1).padStart(2, '0')}`
      return { key, label, count: monthCounts.get(key) || 0 }
    })
    const maintenanceYearMax = maintenanceMonths.reduce((max, item) => Math.max(max, item.count), 0)

    return NextResponse.json({
      success: true,
      data: {
        range,
        groupBy,
        properties: properties || [],
        kpis: {
          billed,
          collected,
          collectionRate,
          expenses: totalExpenses,
          net,
          arrearsNow,
          defaultersCount,
          totalUnits,
          occupancyRate,
        },
        unitStatus: unitStatusCounts,
        timeseries,
        propertyRows,
        maintenanceCalendar: {
          month: monthKey,
          data: maintenanceData,
          max: maintenanceMax,
        },
        maintenanceCalendarYear: {
          year: yearStr,
          months: maintenanceMonths,
          max: maintenanceYearMax,
        },
      },
    })
  } catch (error: any) {
    console.error('[Reports.Overview] Failed', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load overview report.' },
      { status: 500 }
    )
  }
}
```

## `app/api/manager/reports/utils.ts`

```ts
export function getPeriodRange(period?: string) {
  const now = new Date()
  let start: Date | null = null
  let end: Date = now

  switch ((period || '').toLowerCase()) {
    case 'month':
      start = new Date(now)
      start.setMonth(start.getMonth() - 1)
      break
    case 'quarter':
      start = new Date(now)
      start.setMonth(start.getMonth() - 3)
      break
    case 'semi':
    case '6months':
      start = new Date(now)
      start.setMonth(start.getMonth() - 6)
      break
    case 'year':
      start = new Date(now)
      start.setFullYear(start.getFullYear() - 1)
      break
    case 'all':
    default:
      start = null
  }

  return {
    startDate: start ? start.toISOString().slice(0, 10) : null,
    endDate: end.toISOString().slice(0, 10),
  }
}

export function getPreviousPeriod(startDate: string | null, endDate: string) {
  if (!startDate) {
    return { prevStart: null, prevEnd: new Date(endDate).toISOString() }
  }
  const start = new Date(startDate)
  const end = new Date(endDate)
  const duration = end.getTime() - start.getTime()
  const prevEndDate = start
  const prevStartDate = new Date(start.getTime() - duration)
  return {
    prevStart: prevStartDate.toISOString().slice(0, 10),
    prevEnd: prevEndDate.toISOString().slice(0, 10),
  }
}

export function resolveRange(params: {
  period?: string | null
  startDate?: string | null
  endDate?: string | null
}) {
  const { period, startDate, endDate } = params
  if (startDate && endDate) return { start: startDate, end: endDate }
  const { startDate: s, endDate: e } = getPeriodRange(period || 'month')
  return { start: s || null, end: e }
}

export function defaultGroupBy(startIso: string | null, endIso: string): 'day' | 'week' | 'month' {
  if (!startIso) return 'month'
  const start = new Date(startIso)
  const end = new Date(endIso)
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000)

  if (diffDays <= 45) return 'day'
  if (diffDays <= 180) return 'week'
  return 'month'
}

export function safePct(n: number, d: number) {
  if (!d || d <= 0) return 0
  return (n / d) * 100
}

export function bucketKey(isoDate: string, groupBy: 'day' | 'week' | 'month') {
  const d = new Date(isoDate + 'T00:00:00Z')

  if (groupBy === 'day') return isoDate

  if (groupBy === 'month') {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().slice(0, 10)
}
```

## `app/dashboard/manager/reports/benchmark/page.tsx`

```tsx
'use client'

import * as React from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonLoader } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import { ReportFilters, type ReportFilterState } from '@/components/reports/ReportFilters'
import { KpiTiles } from '@/components/reports/KpiTiles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Download, Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { EChart, type EChartsOption } from '@/components/charts/EChart'
import { RadialMiniKpi } from '@/components/reports/benchmark/RadialMiniKpi'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

type Row = {
  propertyId: string
  propertyName: string
  billed: number
  collected: number
  collectionRate: number
  arrearsNow: number
  occupancyRate: number
  unitCount: number
  occupiedLikeCount: number
  expenses: number
  noi: number
  noiMargin: number
}

type Payload = {
  range: { start: string | null; end: string }
  properties: Array<{ id: string; name: string }>
  benchmarks: {
    medianCollectionRate: number
    avgCollectionRate: number
    topProperty: { name: string; rate: number } | null
    bottomProperty: { name: string; rate: number } | null
    spread: number
    underperformers: number
  }
  rows: Row[]
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

function buildGaugeOption(rows: Row[], activeIndex: number): EChartsOption {
  const row = rows[activeIndex] || null
  const val = row ? Number(row.collectionRate.toFixed(2)) : 0

  return {
    title: [
      { text: 'Property Spotlight — Collection Rate', left: 'left' },
      {
        text: row ? row.propertyName : '—',
        left: 'left',
        top: 28,
        textStyle: { fontSize: 14, fontWeight: 'normal' },
      },
    ],
    tooltip: { formatter: '{a}<br/>{b}: {c}%' },
    series: [
      {
        name: 'Collection Rate',
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        pointer: { show: false },
        progress: { show: true, overlap: false, roundCap: true, clip: false },
        axisLine: { lineStyle: { width: 24 } },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        data: [
          {
            value: val,
            name: 'Collected / Billed',
            title: { offsetCenter: ['0%', '-10%'] },
            detail: { valueAnimation: true, offsetCenter: ['0%', '12%'] },
          },
        ],
        title: { fontSize: 12 },
        detail: {
          width: 90,
          height: 22,
          fontSize: 18,
          borderRadius: 999,
          borderWidth: 1,
          formatter: '{value}%',
        },
      },
    ],
  }
}

function buildPolarOption(rows: Row[]): EChartsOption {
  const top = [...rows].sort((a, b) => b.collectionRate - a.collectionRate).slice(0, 8)
  const labels = top.map((x) => x.propertyName)
  const values = top.map((x) => Number(x.collectionRate.toFixed(2)))

  return {
    title: [
      {
        text: 'Property Collection %',
      },
    ],
    polar: {
      radius: [30, '80%'],
    },
    angleAxis: {
      max: 100,
      startAngle: 75,
    },
    radiusAxis: {
      type: 'category',
      data: labels,
    },
    tooltip: {},
    series: {
      type: 'bar',
      data: values,
      coordinateSystem: 'polar',
      label: { show: false },
    },
  }
}

export default function BenchmarkReportPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'year',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })
  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<Payload | null>(null)
  const [spotlightIndex, setSpotlightIndex] = React.useState(0)
  const gridApiRef = React.useRef<GridApi | null>(null)

  const handleFiltersChange = React.useCallback((next: ReportFilterState) => {
    if (next.period === 'custom' && (!next.startDate || !next.endDate)) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      next = {
        ...next,
        startDate: next.startDate || start.toISOString().slice(0, 10),
        endDate: next.endDate || end.toISOString().slice(0, 10),
      }
    }
    setFilters(next)
  }, [])

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams({
        period: filters.period,
        propertyId: filters.propertyId,
      })
      if (filters.period === 'custom' && filters.startDate && filters.endDate) {
        qs.set('startDate', filters.startDate)
        qs.set('endDate', filters.endDate)
      }
      const res = await fetch(`/api/manager/reports/benchmark?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load benchmark report.')
      setPayload(json.data)
      setSpotlightIndex(0)
    } catch (e: any) {
      toast({ title: 'Benchmark report failed', description: e?.message || 'Try again.', variant: 'destructive' })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [filters.period, filters.propertyId, filters.startDate, filters.endDate, toast])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (!payload?.rows?.length) return
    const t = setInterval(() => {
      setSpotlightIndex((i) => (i + 1) % payload.rows.length)
    }, 2500)
    return () => clearInterval(t)
  }, [payload?.rows?.length])

  const kpis = React.useMemo(() => {
    if (!payload) return []
    const b = payload.benchmarks
    return [
      { label: 'Median Collection %', value: `${b.medianCollectionRate.toFixed(1)}%` },
      { label: 'Average Collection %', value: `${b.avgCollectionRate.toFixed(1)}%` },
      {
        label: 'Top Property',
        value: b.topProperty ? `${b.topProperty.rate.toFixed(1)}%` : '—',
        valueClassName: 'text-emerald-600',
        subtext: b.topProperty?.name || '',
      },
      {
        label: 'Bottom Property',
        value: b.bottomProperty ? `${b.bottomProperty.rate.toFixed(1)}%` : '—',
        valueClassName: 'text-rose-600',
        subtext: b.bottomProperty?.name || '',
      },
      { label: 'Spread', value: `${b.spread.toFixed(1)}%`, subtext: 'Top − Bottom' },
      { label: 'Underperformers', value: String(b.underperformers), subtext: 'Below portfolio median' },
    ]
  }, [payload])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return
    const filename = `peer-benchmark-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Peer Benchmark Report — Property Performance',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (r: any) => r.propertyName },
      { header: 'Collected', accessor: (r: any) => kes(r.collected) },
      { header: 'Billed', accessor: (r: any) => kes(r.billed) },
      { header: 'Collection %', accessor: (r: any) => `${r.collectionRate.toFixed(1)}%` },
      { header: 'Arrears (Now)', accessor: (r: any) => kes(r.arrearsNow) },
      { header: 'Occupancy %', accessor: (r: any) => `${r.occupancyRate.toFixed(1)}%` },
      { header: 'Expenses', accessor: (r: any) => kes(r.expenses) },
      { header: 'NOI', accessor: (r: any) => kes(r.noi) },
      { header: 'NOI Margin %', accessor: (r: any) => `${r.noiMargin.toFixed(1)}%` },
    ]

    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, payload.rows, {
        title: 'Peer Benchmark Report — Property Performance',
        subtitle: 'Comparative analytics across properties (YTD/period).',
        summaryRows: [],
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, payload.rows, [], { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, payload.rows, [], { letterhead })
    }
  }

  const gaugeOption = React.useMemo(() => {
    if (!payload?.rows?.length) return {} as EChartsOption
    return buildGaugeOption(payload.rows, spotlightIndex)
  }, [payload?.rows, spotlightIndex])

  const polarOption = React.useMemo(() => {
    if (!payload?.rows?.length) return {} as EChartsOption
    return buildPolarOption(payload.rows)
  }, [payload?.rows])

  const safePct = React.useCallback((n: number, d: number) => {
    if (!d || d <= 0) return 0
    return (n / d) * 100
  }, [])

  const radial = React.useMemo(() => {
    const rows = payload?.rows || []
    const totals = rows.reduce(
      (acc, row) => {
        acc.collected += Number(row.collected || 0)
        acc.billed += Number(row.billed || 0)
        acc.arrears += Number(row.arrearsNow || 0)
        acc.noi += Number(row.noi || 0)
        acc.units += Number(row.unitCount || 0)
        acc.occupiedLike += Number(row.occupiedLikeCount || 0)
        return acc
      },
      { collected: 0, billed: 0, arrears: 0, noi: 0, units: 0, occupiedLike: 0 }
    )

    const portfolioOccupancy = totals.units ? (totals.occupiedLike / totals.units) * 100 : 0
    const collectionRate = safePct(totals.collected, totals.billed)
    const noiMargin = safePct(totals.noi, totals.collected)
    const billedBaseline = Math.max(1, totals.billed)
    const collectedBaseline = Math.max(1, totals.collected)

    return {
      totalCollected: totals.collected,
      totalBilled: totals.billed,
      totalArrears: totals.arrears,
      totalNOI: totals.noi,
      portfolioOccupancy,
      collectionRate,
      noiMargin,
      billedBaseline,
      collectedBaseline,
    }
  }, [payload?.rows, safePct])

  const columnDefs = React.useMemo<ColDef<Row>[]>(
    () => [
      { headerName: 'Property', field: 'propertyName', minWidth: 200, flex: 2, filter: true },
      {
        headerName: 'Collected',
        field: 'collected',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Billed',
        field: 'billed',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Collection %',
        field: 'collectionRate',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
      {
        headerName: 'Arrears',
        field: 'arrearsNow',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'Occupancy %',
        field: 'occupancyRate',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
      {
        headerName: 'Expenses',
        field: 'expenses',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'NOI',
        field: 'noi',
        minWidth: 140,
        flex: 1,
        valueFormatter: (params) => kes(Number(params.value || 0)),
      },
      {
        headerName: 'NOI Margin %',
        field: 'noiMargin',
        minWidth: 150,
        flex: 1,
        valueFormatter: (params) => `${Number(params.value || 0).toFixed(1)}%`,
      },
    ],
    []
  )

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => router.push('/dashboard/manager/reports')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Peer Benchmark</h1>
                <p className="text-sm text-muted-foreground">
                  Compare performance across properties: collection efficiency, arrears exposure, occupancy and NOI.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loading ? (
            <SkeletonLoader />
          ) : (
            <>
              <ReportFilters value={filters} onChange={handleFiltersChange} properties={payload?.properties || []} />
              <KpiTiles items={kpis as any} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-6" />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <RadialMiniKpi
                  title="Collection Rate"
                  subtitle="Portfolio (YTD/period)"
                  value={radial.collectionRate}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                  valueColor="hsl(0 84% 60%)"
                  remainderColor="hsl(142 72% 45%)"
                />
                <RadialMiniKpi
                  title="Collected"
                  subtitle="Cash inflow"
                  value={radial.totalCollected}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                  valueColor="hsl(142 72% 45%)"
                  remainderColor="hsl(0 84% 60%)"
                />
                <RadialMiniKpi
                  title="Billed"
                  subtitle="Invoice issuance"
                  value={radial.totalBilled}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                />
                <RadialMiniKpi
                  title="Arrears Exposure"
                  subtitle="Overdue unpaid / billed"
                  value={radial.totalArrears}
                  max={radial.billedBaseline}
                  ringLabel="KES"
                  valueFormatter={(n) => Math.round(n).toLocaleString()}
                  remainderColor="#4169E1"
                  remainderLabel="Invoiced"
                  tooltipRemainderValue={radial.totalBilled}
                />
                <RadialMiniKpi
                  title="Occupancy"
                  subtitle="Portfolio weighted"
                  value={radial.portfolioOccupancy}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                />
                <RadialMiniKpi
                  title="NOI Margin"
                  subtitle="NOI / Collected"
                  value={radial.noiMargin}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Number(n).toFixed(1)}%`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Spotlight Gauge (Auto-rotating)</CardTitle>
                    <CardDescription>Cycles through properties to highlight collection performance.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EChart option={gaugeOption} className="h-[320px] w-full" />
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Polar Benchmark</CardTitle>
                    <CardDescription>High-visibility comparative chart of top collection rates.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EChart option={polarOption} className="h-[320px] w-full" />
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Benchmark Table</CardTitle>
                  <CardDescription>
                    Enterprise grid with sorting, filtering, and column resizing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="ag-theme-quartz premium-grid glass-grid w-full rounded-2xl border border-white/60 bg-white/70 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur"
                    style={{ height: 520 }}
                  >
                    <AgGridReact<Row>
                      rowData={payload?.rows || []}
                      columnDefs={columnDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: true,
                      }}
                      pagination
                      paginationPageSize={25}
                      animateRows
                      onGridReady={(params) => {
                        gridApiRef.current = params.api
                        params.api.sizeColumnsToFit()
                      }}
                      onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
```

## `app/dashboard/manager/reports/page.tsx`

```tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'
import { useToast } from '@/components/ui/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, BarChart3 } from 'lucide-react'
import * as echarts from 'echarts'

import { ReportFilters, type ReportFilterState } from '@/components/reports/ReportFilters'
import { KpiTiles } from '@/components/reports/KpiTiles'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'

import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import { ParticleButton } from '@/components/ui/particle-button'
import { Switch } from '@/components/ui/switch'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

type OverviewPayload = {
  range: { start: string | null; end: string }
  groupBy: 'day' | 'week' | 'month'
  properties: Array<{ id: string; name: string }>
  kpis: {
    billed: number
    collected: number
    collectionRate: number
    expenses: number
    net: number
    arrearsNow: number
    defaultersCount: number
    totalUnits: number
    occupancyRate: number
  }
  unitStatus: Record<string, number>
  timeseries: Array<{
    period: string
    billed: number
    unpaid?: number
    collected: number
    expenses: number
    net: number
  }>
  propertyRows: Array<{
    propertyId: string
    propertyName: string
    billed: number
    collected: number
    expenses: number
    net: number
    arrearsNow: number
    collectionRate: number
  }>
  maintenanceCalendar?: {
    month: string
    data: Array<[string, number]>
    max: number
  }
  maintenanceCalendarYear?: {
    year: string
    months: Array<{ key: string; label: string; count: number }>
    max: number
  }
}

function kes(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

const performanceConfig = {
  unpaid: { label: 'Bill unpaid', color: '#4c1d95' },
  collected: { label: 'Collected', color: '#16a34a' },
  expenses: { label: 'Expenses', color: '#ef4444' },
  net: { label: 'Net', color: '#1d4ed8' },
} satisfies ChartConfig

export default function ReportsOverviewPage() {
  const { toast } = useToast()
  const router = useRouter()
  const mainRef = React.useRef<HTMLElement | null>(null)
  const [showFloatingActions, setShowFloatingActions] = React.useState(true)
  const calendarRef = React.useRef<HTMLDivElement | null>(null)
  const calendarChartRef = React.useRef<echarts.ECharts | null>(null)
  const [calendarView, setCalendarView] = React.useState<'month' | 'year'>('month')

  const [filters, setFilters] = React.useState<ReportFilterState>({
    period: 'quarter',
    propertyId: 'all',
    groupBy: 'month',
    startDate: null,
    endDate: null,
  })

  const [loading, setLoading] = React.useState(true)
  const [payload, setPayload] = React.useState<OverviewPayload | null>(null)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)

      const qs = new URLSearchParams({
        period: filters.period,
        propertyId: filters.propertyId,
        groupBy: filters.groupBy,
      })
      if (filters.period === 'custom' && filters.startDate && filters.endDate) {
        qs.set('startDate', filters.startDate)
        qs.set('endDate', filters.endDate)
      }

      const res = await fetch(`/api/manager/reports/overview?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load reports overview.')

      setPayload(json.data)
    } catch (err: any) {
      toast({
        title: 'Reports overview failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      })
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [filters.period, filters.propertyId, filters.groupBy, filters.startDate, filters.endDate, toast])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    const target = mainRef.current
    if (!target) return
    const handleScroll = () => {
      setShowFloatingActions(target.scrollTop < 24)
    }
    handleScroll()
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const handleFiltersChange = React.useCallback((next: ReportFilterState) => {
    if (next.period === 'custom' && (!next.startDate || !next.endDate)) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      next = {
        ...next,
        startDate: next.startDate || start.toISOString().slice(0, 10),
        endDate: next.endDate || end.toISOString().slice(0, 10),
      }
    }
    setFilters(next)
  }, [])

  const properties = payload?.properties || []
  const kpis = payload?.kpis

  const kpiTiles = React.useMemo(() => {
    if (!kpis) return []
    return [
      {
        label: 'Billed (period)',
        value: kes(kpis.billed),
      },
      {
        label: 'Collected (period)',
        value: kes(kpis.collected),
        valueClassName: 'text-emerald-600 dark:text-emerald-400',
      },
      { label: 'Collection rate', value: `${kpis.collectionRate.toFixed(1)}%` },
      { label: 'Expenses (period)', value: kes(kpis.expenses) },
      { label: 'Net (period)', value: kes(kpis.net) },
      {
        label: 'Arrears',
        value: kes(kpis.arrearsNow),
        valueClassName: 'text-rose-600 dark:text-rose-400',
      },
      {
        label: 'Occupancy rate',
        value: `${kpis.occupancyRate.toFixed(1)}%`,
        subtext: `${kpis.totalUnits.toLocaleString()} units`,
      },
      { label: 'Defaulters (overdue)', value: kpis.defaultersCount.toLocaleString() },
    ]
  }, [kpis, payload?.range])

  const chartSeries = React.useMemo(() => {
    return (payload?.timeseries || []).map((row) => ({
      ...row,
      unpaid: row.unpaid ?? row.billed,
    }))
  }, [payload?.timeseries])

  React.useEffect(() => {
    const node = calendarRef.current
    if (!node) return

    const chart = calendarChartRef.current || echarts.init(node)
    calendarChartRef.current = chart
    const calendarData = payload?.maintenanceCalendar?.data || []
    const monthKey = payload?.maintenanceCalendar?.month || new Date().toISOString().slice(0, 7)
    const maxValue = payload?.maintenanceCalendar?.max || 0
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    const labelColor = isDark ? '#e2e8f0' : '#0f172a'

    const option: echarts.EChartsOption = {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const date = params?.data?.[0] || params?.name
          const value = params?.data?.[1] ?? 0
          if (!date) return ''
          return `${date}<br/>Maintenance requests: ${value}`
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(maxValue, 1),
        show: false,
        inRange: {
          color: ['#fff7ed', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c'],
        },
      },
      calendar: {
        range: monthKey,
        cellSize: [18, 18],
        orient: 'horizontal',
        left: 44,
        right: 8,
        top: 24,
        bottom: 8,
        yearLabel: { show: false },
        monthLabel: {
          nameMap: 'en',
          margin: 6,
          position: 'start',
          align: 'center',
          color: labelColor,
          fontWeight: 600,
        },
        dayLabel: {
          firstDay: 1,
          nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          margin: 12,
          position: 'start',
          color: labelColor,
          fontWeight: 600,
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.75)',
          borderRadius: 6,
          shadowBlur: 6,
          shadowColor: 'rgba(255,255,255,0.25)',
        },
      },
      series: {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: calendarData,
        itemStyle: {
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          opacity: 0.92,
          shadowBlur: 12,
          shadowColor: 'rgba(249, 115, 22, 0.25)',
          shadowOffsetY: 2,
        },
        emphasis: {
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fed7aa',
            shadowBlur: 18,
            shadowColor: 'rgba(249, 115, 22, 0.55)',
            shadowOffsetY: -4,
            opacity: 1,
          },
        },
      },
    }

    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [payload?.maintenanceCalendar])

  React.useEffect(() => {
    if (calendarView === 'month') {
      calendarChartRef.current?.resize()
    }
  }, [calendarView])

  React.useEffect(() => {
    return () => {
      calendarChartRef.current?.dispose()
      calendarChartRef.current = null
    }
  }, [])

  const exportRows = React.useMemo(() => {
    return (payload?.propertyRows || []).map((row) => ({
      property: row.propertyName,
      billed: kes(row.billed),
      collected: kes(row.collected),
      collectionRate: `${row.collectionRate.toFixed(1)}%`,
      expenses: kes(row.expenses),
      net: kes(row.net),
      arrearsNow: kes(row.arrearsNow),
    }))
  }, [payload?.propertyRows])

  const yearGrid = React.useMemo(() => {
    const yearLabel = payload?.maintenanceCalendarYear?.year || new Date().getUTCFullYear().toString()
    const months = payload?.maintenanceCalendarYear?.months || []
    const map = new Map(months.map((month) => [month.key, month.count]))
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return monthNames.map((label, index) => {
      const key = `${yearLabel}-${String(index + 1).padStart(2, '0')}`
      return { key, label, count: map.get(key) || 0, year: yearLabel }
    })
  }, [payload?.maintenanceCalendarYear])

  const yearGridMax = React.useMemo(() => {
    if (!yearGrid.length) return 0
    return yearGrid.reduce((max, month) => Math.max(max, month.count), 0)
  }, [yearGrid])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (!payload) return

    const filename = `reports-overview-${filters.period}-${filters.propertyId}-${new Date().toISOString().slice(0, 10)}`
    const letterhead = {
      documentTitle: 'Reports Overview - Portfolio Performance',
      generatedAtISO: new Date().toISOString(),
      propertyName:
        filters.propertyId !== 'all'
          ? payload.properties.find((p) => p.id === filters.propertyId)?.name || undefined
          : undefined,
    }

    const columns = [
      { header: 'Property', accessor: (row: any) => row.property },
      { header: 'Billed', accessor: (row: any) => row.billed },
      { header: 'Collected', accessor: (row: any) => row.collected },
      { header: 'Collection %', accessor: (row: any) => row.collectionRate },
      { header: 'Expenses', accessor: (row: any) => row.expenses },
      { header: 'Net', accessor: (row: any) => row.net },
      { header: 'Arrears (Now)', accessor: (row: any) => row.arrearsNow },
    ]

    const summaryRows = [
      [
        'TOTAL',
        kes(payload.kpis.billed),
        kes(payload.kpis.collected),
        `${payload.kpis.collectionRate.toFixed(1)}%`,
        kes(payload.kpis.expenses),
        kes(payload.kpis.net),
        kes(payload.kpis.arrearsNow),
      ],
    ]

    if (format === 'pdf') {
      await exportRowsAsPDF(filename, columns, exportRows, {
        title: 'Reports Overview - Portfolio Performance',
        subtitle: `Period: ${filters.period}. Scope: ${
          filters.propertyId === 'all' ? 'All properties' : 'Single property'
        }. Paid invoices are status_text='paid'. Payments use payment_date.`,
        summaryRows,
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      await exportRowsAsExcel(filename, columns, exportRows, summaryRows, { letterhead })
    } else {
      await exportRowsAsCSV(filename, columns, exportRows, summaryRows, { letterhead })
    }
  }

  const actionLinks = [
    { label: 'Revenue Report', href: '/dashboard/manager/reports/revenue' },
    { label: 'Occupancy Report', href: '/dashboard/manager/reports/occupancy' },
    { label: 'Maintenance Report', href: '/dashboard/manager/reports/maintenance-performance' },
    { label: 'Financial Report', href: '/dashboard/manager/reports/financial' },
    { label: 'Peer Benchmark', href: '/dashboard/manager/reports/benchmark' },
    { label: 'Arrears Report', href: '/dashboard/manager/reports/arrears' },
  ]

  return (
    <div className="flex min-h-screen bg-muted/20">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />

        <main ref={mainRef} className="flex-1 p-6 md:p-8 space-y-6 overflow-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Reports Overview</h1>
                <p className="text-sm text-muted-foreground">
                  Enterprise portfolio KPIs, trends, property comparisons, and exports.
                </p>
                {showFloatingActions ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {actionLinks.map((item) => (
                      <Button
                        key={item.href}
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-slate-200/70 bg-white/70 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-900 hover:text-white"
                        onClick={() => router.push(item.href)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shrink-0">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loading ? (
            <div className="space-y-4">
              <SkeletonLoader height={20} width="60%" />
              <SkeletonLoader height={16} width="40%" />
              <SkeletonTable rows={4} columns={4} />
            </div>
          ) : (
            <>
              <ReportFilters value={filters} onChange={handleFiltersChange} properties={properties} />

              <KpiTiles
                items={kpiTiles as any}
                className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Bill Unpaid vs Collected</CardTitle>
                    <CardDescription>
                      Unpaid bills are invoiced charges pending confirmed payment (prepaid rent excluded). Collected
                      reflects payments received in the period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <AreaChart data={chartSeries} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          dataKey="unpaid"
                          type="monotone"
                          fill="var(--color-unpaid)"
                          stroke="var(--color-unpaid)"
                          fillOpacity={0.25}
                        />
                        <Area
                          dataKey="collected"
                          type="monotone"
                          fill="var(--color-collected)"
                          stroke="var(--color-collected)"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Cashflow</CardTitle>
                    <CardDescription>Net = collected - expenses.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <BarChart data={chartSeries} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="collected" fill="var(--color-collected)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="net" fill="var(--color-net)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Maintenance Request Calendar</CardTitle>
                        <CardDescription>
                          Darker orange means more requests on that day in the selected month.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            calendarView === 'month'
                              ? 'text-xs font-semibold text-blue-600'
                              : 'text-xs text-muted-foreground'
                          }
                        >
                          Mn
                        </span>
                        <Switch
                          checked={calendarView === 'year'}
                          onCheckedChange={(checked) => setCalendarView(checked ? 'year' : 'month')}
                          className="data-[state=unchecked]:bg-blue-200 data-[state=checked]:bg-blue-600"
                        />
                        <span
                          className={
                            calendarView === 'year'
                              ? 'text-xs font-semibold text-blue-600'
                              : 'text-xs text-muted-foreground'
                          }
                        >
                          Yr
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className={calendarView === 'month' ? 'block' : 'hidden'}>
                      <div className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur overflow-hidden">
                        <div ref={calendarRef} className="h-[330px] w-full" />
                      </div>
                    </div>
                    <div className={calendarView === 'year' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'hidden'}>
                      {yearGrid.map((month) => {
                        const intensity = yearGridMax > 0 ? month.count / yearGridMax : 0
                        const bg = `rgba(249, 115, 22, ${0.12 + intensity * 0.6})`
                        const shadow = `0 16px 28px -18px rgba(249,115,22, ${0.2 + intensity * 0.5})`
                        return (
                          <HoverCard key={month.key} openDelay={120} closeDelay={80}>
                            <HoverCardTrigger asChild>
                              <div
                                className="group rounded-xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur transition-transform hover:-translate-y-1"
                                style={{ backgroundColor: bg, boxShadow: shadow }}
                              >
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                                  {month.label}
                                </div>
                                <div className="mt-3 text-2xl font-semibold text-slate-900">
                                  {month.count}
                                </div>
                                <div className="text-xs text-slate-600">requests</div>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-56">
                              <div className="text-xs text-muted-foreground">Maintenance requests</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">
                                {month.count}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {month.label} {month.year}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Collection Rate</CardTitle>
                    <CardDescription>Collected / Billed (period), based on your canonical rules.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ChartContainer config={performanceConfig} className="h-[280px] w-full">
                      <RadialBarChart
                        innerRadius={70}
                        outerRadius={120}
                        data={[
                          {
                            name: 'collection',
                            value: payload?.kpis?.collectionRate || 0,
                            fill: 'var(--color-collected)',
                          },
                        ]}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <RadialBar dataKey="value" background cornerRadius={10} />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                          <tspan className="text-2xl font-semibold">
                            {(payload?.kpis?.collectionRate || 0).toFixed(1)}%
                          </tspan>
                        </text>
                      </RadialBarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Property Performance</CardTitle>
                  <CardDescription>
                    Per property billed, collected, expenses, net, arrears. Click property to drill down.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="py-2 text-left">Property</th>
                          <th className="py-2 text-right">Billed</th>
                          <th className="py-2 text-right">Collected</th>
                          <th className="py-2 text-right">Collection %</th>
                          <th className="py-2 text-right">Expenses</th>
                          <th className="py-2 text-right">Net</th>
                          <th className="py-2 text-right">Arrears (Now)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(payload?.propertyRows || []).map((row) => (
                          <tr key={row.propertyId} className="border-b hover:bg-muted/40">
                            <td className="py-2">
                              <Link
                                href={`/dashboard/manager/reports/revenue?property=${row.propertyId}`}
                                className="font-medium hover:underline"
                              >
                                {row.propertyName}
                              </Link>
                            </td>
                            <td className="py-2 text-right">{kes(row.billed)}</td>
                            <td className="py-2 text-right">{kes(row.collected)}</td>
                            <td className="py-2 text-right">{row.collectionRate.toFixed(1)}%</td>
                            <td className="py-2 text-right">{kes(row.expenses)}</td>
                            <td className="py-2 text-right">{kes(row.net)}</td>
                            <td className="py-2 text-right">{kes(row.arrearsNow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!payload?.propertyRows?.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">
                      No property data found for this scope.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Actions</CardTitle>
                  <CardDescription>Jump into specialized reports for deeper analysis.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                    {actionLinks.map((item) => (
                      <ParticleButton
                        key={item.href}
                        variant="default"
                        className="h-10 w-full justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-b from-neutral-700 via-neutral-900 to-black px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_20px_-12px_rgba(0,0,0,0.8)] ring-1 ring-black/40 hover:from-neutral-600 hover:via-neutral-800 hover:to-neutral-950 sm:text-sm"
                        onClick={() => router.push(item.href)}
                      >
                        <span>{item.label}</span>
                      </ParticleButton>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </>
          )}
        </main>
      </div>
    </div>
  )
}
```

## `components/charts/EChart.tsx`

```tsx
'use client'

import * as React from 'react'
import * as echarts from 'echarts'
import { cn } from '@/lib/utils'

export type EChartsOption = echarts.EChartsOption

type Props = {
  option: EChartsOption
  className?: string
  style?: React.CSSProperties
}

export function EChart({ option, className, style }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<echarts.ECharts | null>(null)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const chart = chartRef.current || echarts.init(node)
    chartRef.current = chart
    chart.setOption(option, true)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [option])

  React.useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return <div ref={containerRef} className={cn('w-full', className)} style={style} />
}
```

## `components/dashboard/header.tsx`

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, LogOut, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

interface NotificationItem {
  id: string
  sender_user_id: string
  message_text: string
  created_at: string
  read: boolean
  related_entity_type?: string | null
  related_entity_id?: string | null
}

function formatRelative(dateString: string) {
  const date = new Date(dateString)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function formatRoleLabel(role: unknown): string {
  const raw = String(role ?? '').trim().toLowerCase()
  if (!raw) return 'User'
  if (raw === 'admin') return 'Admin'
  if (raw === 'manager') return 'Manager'
  if (raw === 'caretaker') return 'Caretaker'
  if (raw === 'tenant') return 'Tenant'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function Header() {
  const { user, signOut } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [userFirstName, setUserFirstName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const unreadCount = notifications.filter((n) => {
    const type = (n.related_entity_type || '').toLowerCase()
    return type === 'lease_expired' || !n.read
  }).length
  const expiredCount = notifications.filter(
    (n) => (n.related_entity_type || '').toLowerCase() === 'lease_expired'
  ).length
  const router = useRouter()

  // Fetch user's first name from profile
  useEffect(() => {
    const fetchUserFirstName = async () => {
      if (!user?.id) return

      try {
        const response = await fetch(`/api/user/profile?userId=${user.id}`, {
          credentials: 'include',
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data?.full_name) {
            // Extract first name from full_name
            const firstName = result.data.full_name.split(' ')[0]
            setUserFirstName(firstName)
          }
          if (result.success && result.data?.role) {
            setUserRole(result.data.role)
          } else if (result.success && result.data?.role === null) {
            setUserRole(null)
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }

    fetchUserFirstName()
  }, [user])

  const sortNotifications = useCallback((items: NotificationItem[]) => {
    const rank = (item: NotificationItem) => {
      const type = (item.related_entity_type || '').toLowerCase()
      if (type === 'lease_expired') return 0
      if (type === 'vacate_notice') return 1
      if (type === 'tenant_transition') return 2
      if (type === 'payment') return 3
      if (type === 'maintenance_request') return 4
      return 5
    }

    return [...items].sort((a, b) => {
      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return bTime - aTime
    })
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/manager/notifications', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to fetch notifications.')
      }
      const payload = await response.json()
      const visible = (payload.data || []).filter((item: NotificationItem) => {
        const type = (item.related_entity_type || '').toLowerCase()
        return type === 'lease_expired' || !item.read
      })
      setNotifications(sortNotifications(visible))
    } catch (error) {
      console.error('[Header] notifications fetch failed', error)
    }
  }, [sortNotifications])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`manager-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'communications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchNotifications, supabase, user?.id])

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      const type = (notification.related_entity_type || '').toLowerCase()
      if (type !== 'lease_expired' && !notification.read) {
        await fetch('/api/manager/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [notification.id] }),
        })
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      } else if (type !== 'lease_expired') {
        setNotifications((current) => current.filter((item) => item.id !== notification.id))
      }
      setNotificationsOpen(false)
      if (type === 'maintenance_request' && notification.related_entity_id) {
        router.push(`/dashboard/maintenance?requestId=${notification.related_entity_id}`)
      } else if (type === 'payment') {
        router.push('/dashboard/payments?tab=deposits')
      } else if (type === 'vacate_notice') {
        const tenantId = notification.sender_user_id
        const noticeId = notification.related_entity_id
        const qs = new URLSearchParams()
        if (noticeId) qs.set('noticeId', noticeId)
        qs.set('tab', 'vacate_notice')
        router.push(tenantId ? `/dashboard/tenants/${tenantId}/lease?${qs.toString()}` : '/dashboard/tenants')
      } else if (type === 'tenant_transition') {
        const caseId = notification.related_entity_id
        if (caseId) {
          router.push(`/dashboard/manager/transitions/${caseId}`)
        } else {
          router.push('/dashboard/manager/transitions')
        }
      } else if (type === 'lease_expired') {
        const tenantId = notification.sender_user_id
        if (tenantId) {
          router.push(`/dashboard/tenants/${tenantId}/lease`)
        } else {
          router.push('/dashboard/tenants')
        }
      } else if (type === 'lease_renewal') {
        const tenantId = notification.sender_user_id
        const renewalId = notification.related_entity_id
        if (tenantId) {
          const qs = renewalId ? `?renewalId=${renewalId}` : ''
          router.push(`/dashboard/tenants/${tenantId}/lease${qs}`)
        } else {
          router.push('/dashboard/tenants')
        }
      } else {
        router.push(
          `/dashboard/tenants/${notification.sender_user_id}/messages?tenantId=${notification.sender_user_id}`
        )
      }
    } catch (error) {
      console.error('[Header] notification navigation failed', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications
      .filter((n) => (n.related_entity_type || '').toLowerCase() !== 'lease_expired')
      .map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await fetch('/api/manager/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      })
      setNotifications((current) =>
        current.filter((item) => (item.related_entity_type || '').toLowerCase() === 'lease_expired')
      )
    } catch (error) {
      console.error('[Header] mark all notifications failed', error)
    }
  }

  const handleLogout = async () => {
    await signOut()
  }

  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center justify-between p-6 max-w-full w-full">
        {/* Search */}
        <div className="flex items-center flex-1 mr-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search properties, tasks, etc..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotificationsOpen(true)}
              className="relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center p-0">
                  {unreadCount}
                </Badge>
              )}
            </Button>
            <SheetContent side="right" className="w-[28rem] px-0">
              <div className="px-6 pt-6 pb-4 border-b border-border/60 bg-gradient-to-r from-[#f4f6fb] to-white sticky top-0 z-10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <SheetTitle className="text-lg flex items-center gap-2">
                      Notifications
                      {expiredCount > 0 && (
                        <Badge className="bg-rose-500/80 text-white rounded-full px-2 py-0.5 text-xs">
                          Lease expired ({expiredCount})
                        </Badge>
                      )}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Stay updated on tenant activity and billing alerts
                    </p>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMarkAllAsRead}
                        className="text-xs mt-2"
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-8 rounded-full border border-border text-foreground hover:bg-muted transition"
                      aria-label="Close notifications"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </SheetClose>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No notifications</p>
                ) : (
                  notifications.map((notification) => {
                    const type = (notification.related_entity_type || '').toLowerCase()
                    const isPayment = type === 'payment'
                    const isMaintenance = type === 'maintenance_request'
                    const isLeaseRenewal = type === 'lease_renewal'
                    const isLeaseExpired = type === 'lease_expired'
                    const isVacateNotice = type === 'vacate_notice'
                    const isTransition = type === 'tenant_transition'
                    const rowClasses = isPayment
                      ? 'bg-red-500/10 border-red-200'
                      : isMaintenance
                        ? 'bg-orange-500/10 border-orange-200'
                        : isLeaseRenewal
                          ? 'bg-violet-500/10 border-violet-200'
                          : isLeaseExpired
                            ? 'bg-rose-500/10 border-rose-200'
                            : isVacateNotice
                              ? 'bg-amber-500/10 border-amber-200'
                              : isTransition
                                ? 'bg-indigo-500/10 border-indigo-200'
                          : notification.read
                            ? 'bg-background border-border'
                            : 'bg-primary/5 border-primary/20'

                    return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 rounded-2xl border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm ${rowClasses}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-sm flex items-center gap-2">
                            {isPayment ? (
                              <Badge className="bg-red-500/80 text-white rounded-full px-2 py-0.5">
                                Payment alert
                              </Badge>
                            ) : isMaintenance ? (
                              <Badge className="bg-orange-500/80 text-white rounded-full px-2 py-0.5">
                                Maintenance request
                              </Badge>
                            ) : isLeaseRenewal ? (
                              <Badge className="bg-violet-500/80 text-white rounded-full px-2 py-0.5">
                                Lease renewal
                              </Badge>
                            ) : isLeaseExpired ? (
                              <Badge className="bg-rose-500/80 text-white rounded-full px-2 py-0.5">
                                Lease expired
                              </Badge>
                            ) : isVacateNotice ? (
                              <Badge className="bg-amber-500/80 text-white rounded-full px-2 py-0.5">
                                Vacate notice
                              </Badge>
                            ) : isTransition ? (
                              <Badge className="bg-indigo-500/80 text-white rounded-full px-2 py-0.5">
                                Transition
                              </Badge>
                            ) : null}
                            <span>
                              {isPayment
                                ? 'Payment notice'
                                : isMaintenance
                                  ? 'Maintenance update'
                                  : isLeaseRenewal
                                    ? 'Countersign required'
                                    : isLeaseExpired
                                      ? 'Lease expired'
                                      : isVacateNotice
                                        ? 'Vacate notice'
                                        : isTransition
                                          ? 'Move-out transition'
                                    : 'New tenant message'}
                            </span>
                          </p>
                          <p
                            className={`text-xs mt-2 leading-relaxed ${
                              isLeaseExpired
                                ? 'text-rose-700'
                                : isVacateNotice
                                  ? 'text-amber-700'
                                  : isTransition
                                    ? 'text-indigo-700'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {notification.message_text}
                          </p>
                        </div>
                        {(!notification.read || isLeaseExpired) && (
                          <div className="w-2 h-2 bg-primary rounded-full mt-1 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        {notification.created_at ? formatRelative(notification.created_at) : ''}
                      </p>
                    </button>
                    )
                  })
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 pl-2 pr-1 min-h-[46px] text-gray-900 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:text-gray-100 dark:hover:bg-gray-800"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium">
                    {userFirstName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRoleLabel(
                      userRole ||
                        (user?.user_metadata as any)?.role ||
                        (user as any)?.role
                    )}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/help')}>
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/status')}>
                System Status
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
```

## `components/dashboard/sidebar.tsx`

```tsx
'use client'

	import Link from 'next/link'
	import { useState, useEffect, useMemo } from 'react'
	import { usePathname, useRouter } from 'next/navigation'
	import { Button } from '@/components/ui/button'
	import { LayoutDashboard, Building2, Users, CreditCard, Droplet, Wrench, MessageSquare, Bell, BarChart3, FileText, Settings, LogOut, Lock, Unlock, Receipt, Camera, Loader2, ArrowLeftRight } from 'lucide-react'
	import { cn } from '@/lib/utils'
	import { useAuth } from '@/lib/auth/context'
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
	import { useToast } from '@/components/ui/use-toast'
	import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Building2, label: 'Properties', href: '/dashboard/properties' },
  { icon: Users, label: 'Tenants', href: '/dashboard/tenants' },
  { icon: CreditCard, label: 'Payments', href: '/dashboard/payments' },
  { icon: Droplet, label: 'Water Bills', href: '/dashboard/water-bills' },
  { icon: Receipt, label: 'Expenses', href: '/dashboard/manager/expenses' },
  { icon: Wrench, label: 'Maintenance', href: '/dashboard/maintenance' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/communications' },
  { icon: Bell, label: 'Notices', href: '/dashboard/manager/notices' },
  { icon: ArrowLeftRight, label: 'Transitions', href: '/dashboard/manager/transitions' },
  { icon: BarChart3, label: 'Reports', href: '/dashboard/manager/reports' },
  { icon: FileText, label: 'Statements', href: '/dashboard/manager/statements' },
]

	function Sidebar() {
	  const [isExpanded, setIsExpanded] = useState(false)
	  const [isLocked, setIsLocked] = useState(false)
	  const pathname = usePathname()
	  const router = useRouter()
	  const { user } = useAuth()
	  const { toast } = useToast()
	  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
	  const isCaretaker = role === 'caretaker'
	  const canEditOrgLogo = role === 'admin' || role === 'manager'
	  const [organization, setOrganization] = useState<{
	    name: string
	    logo_url: string | null
	  } | null>(null)
	  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
	  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false)
	  const [logoFile, setLogoFile] = useState<File | null>(null)
	  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
	  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

	  // Fetch organization data
	  useEffect(() => {
	    let isMounted = true
	    let retryTimeout: NodeJS.Timeout | null = null

    const fetchOrganization = async () => {
      if (!user) {
        return
      }

      // Small delay to ensure auth context is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100))

      let retries = 0
      const maxRetries = 3

      const attemptFetch = async (): Promise<void> => {
        if (!isMounted) return

        try {
          const response = await fetch('/api/organizations/current', {
            cache: 'no-store',
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              'Content-Type': 'application/json',
            },
          })

          // Handle 404 gracefully
          if (response.status === 404) {
            setOrganization(null)
            return
          }

          if (!response.ok) {
            if (response.status === 401) {
              return
            }
            throw new Error(`API error: ${response.status}`)
          }

          const result = await response.json()

          if (result.success && result.data && result.data.name) {
            if (isMounted) {
              setOrganization({
                name: result.data.name,
                logo_url: result.data.logo_url || null,
              })
            }
          }
        } catch (error) {
          console.error(`[Sidebar] Error fetching organization (attempt ${retries + 1}):`, error)

          if (retries < maxRetries) {
            retries++
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000)
            retryTimeout = setTimeout(() => {
              if (isMounted) attemptFetch()
            }, delay)
          }
        }
      }

      attemptFetch()

      return () => {
        isMounted = false
        if (retryTimeout) clearTimeout(retryTimeout)
      }
    }

    if (user) {
      fetchOrganization()
    }

    return () => {
      isMounted = false
      if (retryTimeout) clearTimeout(retryTimeout)
    }
	  }, [user])

	  useEffect(() => {
	    setLogoLoadFailed(false)
	  }, [organization?.logo_url])

	  useEffect(() => {
	    if (!logoFile) {
	      setLogoPreviewUrl(null)
	      return
	    }
	    const url = URL.createObjectURL(logoFile)
	    setLogoPreviewUrl(url)
	    return () => URL.revokeObjectURL(url)
	  }, [logoFile])

	  const visibleMenuItems = useMemo(() => {
	    if (!isCaretaker) return menuItems
    const allowed = new Set([
      '/dashboard',
      '/dashboard/tenants',
      '/dashboard/payments',
      '/dashboard/water-bills',
      '/dashboard/communications',
      '/dashboard/maintenance',
      '/dashboard/manager/transitions',
    ])
    return menuItems.filter((item) => allowed.has(item.href))
  }, [isCaretaker])

  // Get display name - truncate if too long
	  const displayName = useMemo(() => {
	    if (!organization?.name) {
	      return null
	    }

    const name = organization.name.trim()
    if (name.length > 18) {
      const firstWord = name.split(/\s+/)[0]
      return firstWord.length > 18 ? firstWord.substring(0, 18) : firstWord
    }

	    return name
	  }, [organization?.name])

	  const orgInitials = useMemo(() => {
	    const name = organization?.name?.trim()
	    if (!name) return 'RK'
	    return name
	      .split(/\s+/)
	      .map((word) => word.charAt(0))
	      .join('')
	      .substring(0, 2)
	      .toUpperCase()
	  }, [organization?.name])

	  const { signOut } = useAuth()

	  const handleLogout = async () => {
	    await signOut()
	  }

	  const handleOpenLogoDialog = () => {
	    if (!canEditOrgLogo) return
	    setLogoFile(null)
	    setIsLogoDialogOpen(true)
	  }

	  const handleUploadLogo = async () => {
	    if (!logoFile) {
	      toast({ title: 'Select a logo', description: 'Choose an image to upload.', variant: 'destructive' })
	      return
	    }

	    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
	    if (!allowedTypes.includes(logoFile.type)) {
	      toast({
	        title: 'Invalid file type',
	        description: 'Only JPEG, PNG, and WebP images are allowed.',
	        variant: 'destructive',
	      })
	      return
	    }

	    const maxSize = 5 * 1024 * 1024
	    if (logoFile.size > maxSize) {
	      toast({ title: 'File too large', description: 'Max size is 5MB.', variant: 'destructive' })
	      return
	    }

	    try {
	      setIsUploadingLogo(true)
	      const supabase = createSupabaseClient()
	      const timestamp = Date.now()
	      const ext = logoFile.name.split('.').pop() || 'png'
	      const filePath = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`
	      const bucketName = 'profile-pictures'

	      const { error: uploadErr } = await supabase.storage.from(bucketName).upload(filePath, logoFile, {
	        contentType: logoFile.type,
	        cacheControl: '3600',
	        upsert: false,
	      })
	      if (uploadErr) throw uploadErr

	      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath)
	      const publicUrl = urlData?.publicUrl
	      if (!publicUrl) throw new Error('Failed to get public URL for uploaded logo')

	      const res = await fetch('/api/organizations/logo', {
	        method: 'PUT',
	        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify({ logo_url: publicUrl }),
	      })
	      const json = await res.json().catch(() => ({}))
	      if (!res.ok || !json?.success) {
	        throw new Error(json?.error || 'Failed to update organization logo')
	      }

	      setOrganization((prev) => (prev ? { ...prev, logo_url: publicUrl } : prev))
	      setLogoLoadFailed(false)
	      setIsLogoDialogOpen(false)
	      toast({ title: 'Logo updated', description: 'Your organization logo was updated successfully.' })
	    } catch (e) {
	      toast({
	        title: 'Upload failed',
	        description: e instanceof Error ? e.message : 'Could not upload logo.',
	        variant: 'destructive',
	      })
	    } finally {
	      setIsUploadingLogo(false)
	    }
	  }

  const handleLockToggle = () => {
    setIsLocked(!isLocked)
  }

  const handleMouseEnter = () => {
    if (!isLocked) {
      setIsExpanded(true)
    }
  }

  const handleMouseLeave = () => {
    if (!isLocked) {
      setIsExpanded(false)
    }
  }

  return (
    <>
      <aside 
        className={cn(
          "hidden lg:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ease-in-out",
          isExpanded ? "w-64" : "w-20"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
	        {/* Organization Logo and Name */}
	        <div className="p-6 border-b border-gray-200 min-h-[88px] flex items-center">
	          <div className="flex items-center gap-3 w-full">
	            {/* Logo Container - Always show, size fixed at 40x40px */}
	            <button
	              type="button"
	              onClick={handleOpenLogoDialog}
	              disabled={!canEditOrgLogo}
	              className={cn(
	                'relative group flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#4682B4] to-[#5a9fd4] border border-gray-200 shadow-sm',
	                canEditOrgLogo ? 'cursor-pointer' : 'cursor-default'
	              )}
	              aria-label={canEditOrgLogo ? 'Change organization logo' : 'Organization logo'}
	            >
	              {organization?.logo_url && !logoLoadFailed ? (
	                <img
	                  src={organization.logo_url}
	                  alt={organization.name || 'Organization logo'}
	                  className="w-full h-full object-contain bg-white/95"
	                  onError={() => setLogoLoadFailed(true)}
	                />
	              ) : (
	                <span className="text-white font-bold text-sm">{orgInitials}</span>
	              )}

	              {canEditOrgLogo ? (
	                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/35 flex items-center justify-center">
	                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/95 text-gray-900 shadow-sm">
	                    <Camera className="w-4 h-4" />
	                  </span>
	                </span>
	              ) : null}
	            </button>
            
            {/* Organization Name - Only show when expanded */}
	            {isExpanded && (
	              <div className="overflow-hidden flex-1 min-w-0 max-w-[200px]">
	                <h1 
                  className="text-lg font-bold text-[#4682B4] whitespace-nowrap truncate"
                  title={organization?.name || 'RES'}
                >
                  {displayName || (organization?.name || 'RES')}
                </h1>
                <p className="text-xs text-gray-600 whitespace-nowrap">Manager Portal</p>
	              </div>
	            )}
	          </div>
	        </div>

	        <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
	          <DialogContent className="sm:max-w-md">
	            <DialogHeader>
	              <DialogTitle>Change organization logo</DialogTitle>
	              <DialogDescription>Upload a JPG, PNG, or WebP image (max 5MB).</DialogDescription>
	            </DialogHeader>

	            <div className="space-y-4">
	              <div className="flex items-center gap-4">
	                <div className="w-16 h-16 rounded-xl overflow-hidden border bg-white flex items-center justify-center">
	                  {logoPreviewUrl ? (
	                    <img src={logoPreviewUrl} alt="New logo preview" className="w-full h-full object-contain" />
	                  ) : organization?.logo_url && !logoLoadFailed ? (
	                    <img src={organization.logo_url} alt="Current logo" className="w-full h-full object-contain" />
	                  ) : (
	                    <span className="text-sm font-semibold text-gray-700">{orgInitials}</span>
	                  )}
	                </div>
	                <div className="flex-1">
	                  <input
	                    type="file"
	                    accept="image/png,image/jpeg,image/webp"
	                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
	                    disabled={isUploadingLogo}
	                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
	                  />
	                  <p className="mt-2 text-xs text-gray-500">
	                    Tip: Use a square logo (e.g. 512×512) for best results.
	                  </p>
	                </div>
	              </div>
	            </div>

	            <DialogFooter>
	              <Button
	                type="button"
	                variant="outline"
	                onClick={() => setIsLogoDialogOpen(false)}
	                disabled={isUploadingLogo}
	              >
	                Cancel
	              </Button>
	              <Button type="button" onClick={handleUploadLogo} disabled={isUploadingLogo}>
	                {isUploadingLogo ? (
	                  <>
	                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
	                    Uploading…
	                  </>
	                ) : (
	                  'Save logo'
	                )}
	              </Button>
	            </DialogFooter>
	          </DialogContent>
	        </Dialog>

        {/* Menu Items */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="default"
                  className={cn(
                    "w-full transition-all duration-200 rounded-xl py-3 px-4 my-1 shadow-sm",
                    isExpanded ? "justify-start" : "justify-center",
                    isActive 
                      ? 'bg-[#4682B4] hover:bg-[#3b6a91] text-white shadow-md' 
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/70'
                  )}
                  title={!isExpanded ? item.label : undefined}
                >
                  <Icon className={cn("w-5 h-5", isExpanded && "mr-3")} />
                  {isExpanded && <span className="whitespace-nowrap">{item.label}</span>}
                </Button>
              </Link>
            )
          })}
        </nav>

        {/* Settings and Logout */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {/* Lock Button */}
          <Button
            variant="ghost"
            size="default"
            onClick={handleLockToggle}
            className={cn(
              "w-full transition-all duration-200 py-2 px-4",
              isExpanded ? "justify-start" : "justify-center",
              isLocked
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-600"
                : "text-gray-700 hover:text-gray-900 hover:bg-gray-300/70"
            )}
            title={!isExpanded ? (isLocked ? "Unlock Sidebar" : "Lock Sidebar") : undefined}
          >
            {isLocked ? (
              <>
                <Lock className={cn("w-5 h-5", isExpanded && "mr-3")} />
                {isExpanded && <span className="whitespace-nowrap">Unlock Sidebar</span>}
              </>
            ) : (
              <>
                <Unlock className={cn("w-5 h-5", isExpanded && "mr-3")} />
                {isExpanded && <span className="whitespace-nowrap">Lock Sidebar</span>}
              </>
            )}
          </Button>
          <Link href="/dashboard/settings">
            <Button 
              variant="ghost" 
              size="default" 
              className={cn(
                "w-full transition-all duration-200 py-2 px-4 text-gray-700 hover:text-gray-900 hover:bg-gray-300/70",
                isExpanded ? "justify-start" : "justify-center"
              )}
              title={!isExpanded ? "Settings" : undefined}
            >
              <Settings className={cn("w-5 h-5", isExpanded && "mr-3")} />
              {isExpanded && <span className="whitespace-nowrap">Settings</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="default"
            className={cn(
              "w-full py-2 px-4 text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-200",
              isExpanded ? "justify-start" : "justify-center"
            )}
            onClick={handleLogout}
            title={!isExpanded ? "Logout" : undefined}
          >
            <LogOut className={cn("w-5 h-5", isExpanded && "mr-3")} />
            {isExpanded && <span className="whitespace-nowrap">Logout</span>}
          </Button>
        </div>
      </aside>
    </>
  )
}

export { Sidebar }
export default Sidebar
```

## `components/reports/KpiTiles.tsx`

```tsx
'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export type KpiItem = {
  label: string
  value: string
  valueClassName?: string
  subtext?: string
  trend?: {
    direction: 'up' | 'down' | 'flat'
    text: string
  }
}

export function KpiTiles(props: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', props.className)}>
      {props.items.map((kpi, idx) => (
        <Card
          key={idx}
          className="border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/80 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
        >
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div
              className={cn(
                'mt-1 text-lg font-semibold tracking-tight leading-tight tabular-nums sm:text-xl',
                kpi.valueClassName
              )}
            >
              {kpi.value}
            </div>

            {(kpi.subtext || kpi.trend) && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <div className="text-muted-foreground">{kpi.subtext || ''}</div>
                {kpi.trend ? (
                  <div
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1',
                      kpi.trend.direction === 'up' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                      kpi.trend.direction === 'down' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                      kpi.trend.direction === 'flat' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {kpi.trend.direction === 'up' && <ArrowUpRight className="h-3.5 w-3.5" />}
                    {kpi.trend.direction === 'down' && <ArrowDownRight className="h-3.5 w-3.5" />}
                    <span className="font-medium">{kpi.trend.text}</span>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

## `components/reports/ReportFilters.tsx`

```tsx
'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChronoSelect } from '@/components/ui/chrono-select'
import { cn } from '@/lib/utils'

export type ReportFilterState = {
  period: 'month' | 'quarter' | 'semi' | 'year' | 'all' | 'custom'
  propertyId: string
  groupBy: 'day' | 'week' | 'month'
  startDate?: string | null
  endDate?: string | null
}

export function ReportFilters(props: {
  value: ReportFilterState
  onChange: (next: ReportFilterState) => void
  properties: Array<{ id: string; name: string }>
  title?: string
}) {
  const { value, onChange, properties } = props
  const startDate = value.startDate ? new Date(`${value.startDate}T00:00:00`) : undefined
  const endDate = value.endDate ? new Date(`${value.endDate}T00:00:00`) : undefined
  const toIso = (date?: Date) => (date ? date.toISOString().slice(0, 10) : null)
  const isCustom = value.period === 'custom'

  return (
    <Card className="border bg-background">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[200px]">
            <Label className="text-xs text-muted-foreground">Time period</Label>
            <Select value={value.period} onValueChange={(v) => onChange({ ...value, period: v as any })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Last 30 days</SelectItem>
                <SelectItem value="quarter">Last 3 months</SelectItem>
                <SelectItem value="semi">Last 6 months</SelectItem>
                <SelectItem value="year">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[240px]">
            <Label className="text-xs text-muted-foreground">Property scope</Label>
            <Select value={value.propertyId} onValueChange={(v) => onChange({ ...value, propertyId: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[180px]">
            <Label className="text-xs text-muted-foreground">Group by</Label>
            <Select value={value.groupBy} onValueChange={(v) => onChange({ ...value, groupBy: v as any })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={cn('w-[220px]', !isCustom && 'opacity-60')}>
            <Label className="text-xs text-muted-foreground">Start date</Label>
            <div className="mt-1">
              <ChronoSelect
                value={startDate}
                disabled={!isCustom}
                onChange={(date) => {
                  const nextStart = toIso(date)
                  const next = { ...value, startDate: nextStart }
                  if (nextStart && value.endDate && nextStart > value.endDate) {
                    next.endDate = nextStart
                  }
                  onChange(next)
                }}
                className="w-full"
              />
            </div>
          </div>
          <div className={cn('w-[220px]', !isCustom && 'opacity-60')}>
            <Label className="text-xs text-muted-foreground">End date</Label>
            <div className="mt-1">
              <ChronoSelect
                value={endDate}
                disabled={!isCustom}
                onChange={(date) => {
                  const nextEnd = toIso(date)
                  const next = { ...value, endDate: nextEnd }
                  if (nextEnd && value.startDate && nextEnd < value.startDate) {
                    next.startDate = nextEnd
                  }
                  onChange(next)
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

## `components/reports/benchmark/RadialMiniKpi.tsx`

```tsx
'use client'

import * as React from 'react'
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

type Props = {
  title: string
  subtitle?: string
  value: number
  max: number
  valueFormatter?: (n: number) => string
  ringLabel?: string
  valueColor?: string
  remainderColor?: string
  remainderLabel?: string
  tooltipRemainderValue?: number
}

export function RadialMiniKpi({
  title,
  subtitle,
  value,
  max,
  valueFormatter,
  ringLabel,
  valueColor,
  remainderColor,
  remainderLabel,
  tooltipRemainderValue,
}: Props) {
  const safeMax = Math.max(1, max)
  const clamped = Math.min(safeMax, Math.max(0, value))

  const chartData = [{ key: 'kpi', value: clamped, remainder: safeMax - clamped }]

  const chartConfig = {
    value: { label: ringLabel || title, color: valueColor || 'var(--chart-1)' },
    remainder: { label: remainderLabel || 'Remainder', color: remainderColor || 'hsl(270 85% 88%)' },
  } satisfies ChartConfig

  const display = valueFormatter ? valueFormatter(value) : String(value)
  const formatValue = (val: number) => (valueFormatter ? valueFormatter(val) : String(val))
  const tooltipFormatter = (
    rawValue: any,
    name: any,
    item: { dataKey?: string; color?: string; payload?: { fill?: string } }
  ) => {
    const key = String(item?.dataKey || name || '')
    const isRemainder = key === 'remainder'
    const displayValue =
      isRemainder && tooltipRemainderValue !== undefined ? tooltipRemainderValue : Number(rawValue || 0)
    const label = isRemainder ? remainderLabel || 'Remainder' : ringLabel || title
    const color = item?.color || item?.payload?.fill || 'currentColor'

    return (
      <div className="flex w-full items-center gap-2">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="ml-auto text-xs font-semibold text-foreground">{formatValue(displayValue)}</span>
      </div>
    )
  }

  return (
    <Card className="border bg-background">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
      </CardHeader>

      <CardContent className="flex items-center justify-center pt-3">
        <ChartContainer config={chartConfig} className="aspect-square w-full max-w-[180px]">
          <RadialBarChart
            data={chartData}
            endAngle={-270}
            startAngle={90}
            innerRadius={66}
            outerRadius={92}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel formatter={tooltipFormatter} />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 4}
                        className="fill-foreground text-sm font-semibold"
                      >
                        {display}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 16}
                        className="fill-muted-foreground text-[10px]"
                      >
                        {ringLabel || 'KPI'}
                      </tspan>
                    </text>
                  )
                }}
              />
            </PolarRadiusAxis>

            <RadialBar
              dataKey="value"
              cornerRadius={8}
              fill="var(--color-value)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="remainder"
              cornerRadius={8}
              fill="var(--color-remainder)"
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

## `components/ui/badge.tsx`

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

## `components/ui/button.tsx`

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

## `components/ui/calendar.tsx`

```tsx
"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  ...props
}: CalendarProps) {
  const defaultClassNames = {
    months: "relative flex flex-col sm:flex-row gap-4",
    month: "w-full",
    month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center z-20",
    caption_label: "text-sm font-medium",
    nav: "absolute top-0 flex w-full justify-between z-10",
    button_previous: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0"
    ),
    button_next: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0"
    ),
    weekday: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
    day_button:
      "relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-foreground outline-offset-2 group-[[data-selected]:not(.range-middle)]:[transition-property:color,background-color,border-radius,box-shadow] group-[[data-selected]:not(.range-middle)]:duration-150 focus:outline-none group-data-[disabled]:pointer-events-none focus-visible:z-10 hover:bg-slate-200 group-data-[selected]:bg-primary hover:text-foreground group-data-[selected]:text-primary-foreground group-data-[disabled]:text-foreground/30 group-data-[disabled]:line-through group-data-[outside]:text-foreground/30 group-data-[outside]:group-data-[selected]:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 group-[.range-start:not(.range-end)]:rounded-e-none group-[.range-end:not(.range-start)]:rounded-s-none group-[.range-middle]:rounded-none group-data-[selected]:group-[.range-middle]:bg-accent group-data-[selected]:group-[.range-middle]:text-foreground",
    day: "group size-9 px-0 text-sm",
    range_start: "range-start",
    range_end: "range-end",
    range_middle: "range-middle",
    today:
      "*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-primary [&[data-selected]:not(.range-middle)>*]:after:bg-background [&[data-disabled]>*]:after:bg-foreground/30 *:after:transition-colors",
    outside: "text-muted-foreground data-selected:bg-accent/50 data-selected:text-muted-foreground",
    hidden: "invisible",
    week_number: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
  }

  const mergedClassNames: typeof defaultClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key as keyof typeof classNames]
        ? cn(
            defaultClassNames[key as keyof typeof defaultClassNames],
            classNames[key as keyof typeof classNames]
          )
        : defaultClassNames[key as keyof typeof defaultClassNames],
    }),
    {} as typeof defaultClassNames
  )

  const defaultComponents = {
    Chevron: (props: any) => {
      if (props.orientation === "left") {
        return <ChevronLeft size={16} strokeWidth={2} {...props} aria-hidden="true" />
      }
      return <ChevronRight size={16} strokeWidth={2} {...props} aria-hidden="true" />
    },
  }

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
```

## `components/ui/card.tsx`

```tsx
import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

## `components/ui/chart.tsx`

```tsx
'use client'

import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/utils'

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children']
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color,
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join('\n')}
}
`,
          )
          .join('\n'),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: 'line' | 'dot' | 'dashed'
    nameKey?: string
    labelKey?: string
  }) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || 'value'}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === 'string'
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn('font-medium', labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn('font-medium', labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== 'dot'

  return (
    <div
      className={cn(
        'border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || 'value'}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.payload.fill || item.color

          return (
            <div
              key={item.dataKey}
              className={cn(
                '[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5',
                indicator === 'dot' && 'items-center',
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          'shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)',
                          {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent':
                              indicator === 'dashed',
                            'my-0.5': nestLabel && indicator === 'dashed',
                          },
                        )}
                        style={
                          {
                            '--color-bg': indicatorColor,
                            '--color-border': indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      'flex flex-1 justify-between leading-none',
                      nestLabel ? 'items-end' : 'items-center',
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = 'bottom',
  nameKey,
}: React.ComponentProps<'div'> &
  Pick<RechartsPrimitive.LegendProps, 'payload' | 'verticalAlign'> & {
    hideIcon?: boolean
    nameKey?: string
  }) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4',
        verticalAlign === 'top' ? 'pb-3' : 'pt-3',
        className,
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || 'value'}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)

        return (
          <div
            key={item.value}
            className={
              '[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3'
            }
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig?.label}
          </div>
        )
      })}
    </div>
  )
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const payloadPayload =
    'payload' in payload &&
    typeof payload.payload === 'object' &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === 'string'
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
```

## `components/ui/chrono-select.tsx`

```tsx
"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"

interface ChronoSelectProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  yearRange?: [number, number]
  minDate?: Date
  maxDate?: Date
  disabled?: boolean
}

export function ChronoSelect({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  yearRange = [1970, 2050],
  minDate,
  maxDate,
  disabled = false,
}: ChronoSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Date | undefined>(value)

  const normalizeDate = React.useCallback((date?: Date) => {
    if (!date) return undefined
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }, [])

  const normalizedMin = React.useMemo(() => normalizeDate(minDate), [minDate, normalizeDate])
  const normalizedMax = React.useMemo(() => normalizeDate(maxDate), [maxDate, normalizeDate])
  const [month, setMonth] = React.useState<Date>(selected ?? normalizedMin ?? new Date())

  const years = React.useMemo(() => {
    const [start, end] = yearRange
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [yearRange])

  const handleSelect = (date: Date | undefined) => {
    setSelected(date)
    setOpen(false)
    onChange?.(date)
  }

  const handleYearChange = (year: string) => {
    const newYear = parseInt(year, 10)
    const newDate = new Date(month)
    newDate.setFullYear(newYear)
    setMonth(newDate)
  }

  React.useEffect(() => {
    setSelected(value)
    if (value) {
      setMonth(value)
    } else if (normalizedMin) {
      setMonth(normalizedMin)
    }
  }, [value, normalizedMin])

  const disabledRange = React.useMemo(() => {
    if (!normalizedMin && !normalizedMax) return undefined
    const range: { before?: Date; after?: Date } = {}
    if (normalizedMin) range.before = normalizedMin
    if (normalizedMax) range.after = normalizedMax
    return range
  }, [normalizedMin, normalizedMax])

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-[280px] justify-start text-left font-normal hover:bg-slate-100 hover:text-foreground",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-2 space-y-2 w-auto">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-medium">{format(month, "MMMM")}</span>
          <Select defaultValue={String(month.getFullYear())} onValueChange={handleYearChange}>
            <SelectTrigger className="h-7 w-[90px] text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="max-h-48">
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          month={month}
          onMonthChange={setMonth}
          disabled={disabledRange}
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  )
}
```

## `components/ui/dialog.tsx`

```tsx
'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
```

## `components/ui/dropdown-menu.tsx`

```tsx
'use client'

import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 py-1.5 text-sm font-medium data-[inset]:pl-8',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'text-muted-foreground ml-auto text-xs tracking-widest',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg',
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
```

## `components/ui/hover-card.tsx`

```tsx
'use client'

import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'

import { cn } from '@/lib/utils'

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
```

## `components/ui/input.tsx`

```tsx
import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
```

## `components/ui/label.tsx`

```tsx
'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/utils'

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
```

## `components/ui/particle-button.tsx`

```tsx
"use client"

import * as React from "react"
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ButtonProps } from "@/components/ui/button";
import { MousePointerClick } from "lucide-react";

interface ParticleButtonProps extends ButtonProps {
    onSuccess?: () => void;
    successDuration?: number;
}

function SuccessParticles({
    buttonRef,
}: {
    buttonRef: React.RefObject<HTMLButtonElement>;
}) {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return (
        <AnimatePresence>
            {[...Array(6)].map((_, i) => (
                <motion.div
                    key={i}
                    className="fixed w-1 h-1 bg-black dark:bg-white rounded-full"
                    style={{ left: centerX, top: centerY }}
                    initial={{
                        scale: 0,
                        x: 0,
                        y: 0,
                    }}
                    animate={{
                        scale: [0, 1, 0],
                        x: [0, (i % 2 ? 1 : -1) * (Math.random() * 50 + 20)],
                        y: [0, -Math.random() * 50 - 20],
                    }}
                    transition={{
                        duration: 0.6,
                        delay: i * 0.1,
                        ease: "easeOut",
                    }}
                />
            ))}
        </AnimatePresence>
    );
}

function ParticleButton({
    children,
    onClick,
    onSuccess,
    successDuration = 1000,
    className,
    asChild,
    ...props
}: ParticleButtonProps) {
    const [showParticles, setShowParticles] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const showIcon = !asChild;

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
        setShowParticles(true);
        onClick?.(e);

        setTimeout(() => {
            setShowParticles(false);
            onSuccess?.();
        }, successDuration);
    };

    return (
        <>
            {showParticles && <SuccessParticles buttonRef={buttonRef} />}
            <Button
                ref={buttonRef}
                onClick={handleClick}
                className={cn(
                    "relative",
                    showParticles && "scale-95",
                    "transition-transform duration-100",
                    className
                )}
                asChild={asChild}
                {...props}
            >
                {showIcon ? (
                    <>
                        {children}
                        <MousePointerClick className="h-4 w-4" />
                    </>
                ) : (
                    children
                )}
            </Button>
        </>
    );
}

export { ParticleButton }
```

## `components/ui/popover.tsx`

```tsx
'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
```

## `components/ui/select.tsx`

```tsx
'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
```

## `components/ui/sheet.tsx`

```tsx
'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
```

## `components/ui/skeletons.tsx`

```tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type SkeletonLoaderProps = {
  width?: number | string
  height?: number | string
  count?: number
  className?: string
  rounded?: string
}

const basePulseClass = 'animate-pulse bg-gray-200 dark:bg-gray-800'

export function SkeletonLoader({
  width = '100%',
  height = 16,
  count = 1,
  className,
  rounded = 'rounded-md',
}: SkeletonLoaderProps) {
  const items = Array.from({ length: count })
  return (
    <div aria-label="Loading..." role="status" className="space-y-2">
      {items.map((_, idx) => (
        <div
          key={idx}
          className={cn(basePulseClass, rounded, className)}
          style={{ width, height, animationDuration: '2.4s' }}
        />
      ))}
    </div>
  )
}

type SkeletonCardProps = {
  count?: number
}

export function SkeletonPropertyCard({ count = 4 }: SkeletonCardProps) {
  const items = Array.from({ length: count })
  return (
    <div aria-label="Loading..." role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((_, idx) => (
        <div key={idx} className="p-4 border rounded-xl bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(basePulseClass, 'rounded-full')} style={{ width: 40, height: 40, animationDuration: '2.2s' }} />
            <div className="flex-1 space-y-2">
              <SkeletonLoader height={12} width="70%" />
              <SkeletonLoader height={10} width="50%" />
            </div>
          </div>
          <SkeletonLoader height={32} width="100%" rounded="rounded-lg" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SkeletonLoader height={10} />
            <SkeletonLoader height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

type SkeletonTableProps = {
  rows?: number
  columns?: number
}

export function SkeletonTable({ rows = 6, columns = 4 }: SkeletonTableProps) {
  const rowArray = Array.from({ length: rows })
  const colArray = Array.from({ length: columns })
  return (
    <div aria-label="Loading..." role="status" className="w-full rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {colArray.map((_, idx) => (
                <th key={idx} className="p-2">
                  <SkeletonLoader height={12} width="80%" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowArray.map((_, rIdx) => (
              <tr key={rIdx} className="border-t dark:border-gray-800">
                {colArray.map((_, cIdx) => (
                  <td key={cIdx} className="p-2">
                    <SkeletonLoader height={12} width={`${60 + cIdx * 10}%`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SkeletonChartProps = {
  bars?: number
}

export function SkeletonChart({ bars = 6 }: SkeletonChartProps) {
  const items = Array.from({ length: bars })
  return (
    <div aria-label="Loading..." role="status" className="p-4 rounded-xl border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="h-56 flex items-end gap-3">
        {items.map((_, idx) => (
          <div
            key={idx}
            className={cn(basePulseClass, 'rounded-md flex-1')}
            style={{
              height: `${40 + idx * (40 / bars)}%`,
              animationDuration: '2.6s',
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <SkeletonLoader height={10} />
        <SkeletonLoader height={10} />
        <SkeletonLoader height={10} />
      </div>
    </div>
  )
}
```

## `components/ui/switch.tsx`

```tsx
'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

## `components/ui/toast.tsx`

```tsx
'use client'

import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm opacity-90', className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
```

## `components/ui/use-toast.ts`

```ts
'use client'

// Inspired by react-hot-toast library
import * as React from 'react'

import type { ToastActionElement, ToastProps } from '@/components/ui/toast'

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType['ADD_TOAST']
      toast: ToasterToast
    }
  | {
      type: ActionType['UPDATE_TOAST']
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType['DISMISS_TOAST']
      toastId?: ToasterToast['id']
    }
  | {
      type: ActionType['REMOVE_TOAST']
      toastId?: ToasterToast['id']
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      }

    case 'DISMISS_TOAST': {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      }
    }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, 'id'>

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
```

## `lib/auth/context.tsx`

```tsx
'use client'

import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, Session } from '@/lib/supabase/types'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setSession(session as Session | null)
      setUser(session?.user as User | null)
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session as Session | null)
      setUser(session?.user as User | null)
      setLoading(false)

      if (event === 'SIGNED_OUT') {
        const publicRoutes = ['/auth', '/tenant/set-password']
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
        const isPublic = publicRoutes.some((route) => currentPath.startsWith(route))
        if (!isPublic) {
          router.push('/auth/login')
        }
      } else if (event === 'SIGNED_IN') {
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    } catch (err) {
      console.error('[AuthContext] Failed to sign out via API', err)
    }

    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    router.push('/auth/login')
  }

  const refreshSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.refreshSession()
    setSession(session as Session | null)
    setUser(session?.user as User | null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

## `lib/export/download.ts`

```ts
'use client'

import type { LetterheadMeta, ResolvedOrganizationBrand } from '@/lib/exports/letterhead'
import { fetchCurrentOrganizationBrand, safeFilename } from '@/lib/exports/letterhead'
import { exportTablePdf } from '@/lib/exports/pdf'
import { exportCsvWithLetterhead } from '@/lib/exports/csv'
import { exportExcelWithLetterhead } from '@/lib/exports/excel'

export type ExportColumn<T> = {
  header: string
  accessor: (row: T) => string | number | null | undefined
  width?: number
  align?: 'left' | 'right' | 'center'
}

type PdfOptions = {
  title?: string
  subtitle?: string
  footerNote?: string
  summaryRows?: Array<Array<string | number>>
  letterhead?: Partial<LetterheadMeta>
  orientation?: 'portrait' | 'landscape' | 'auto'
  tableStyles?: Partial<{
    fontSize: number
    cellPadding: number | { top?: number; right?: number; bottom?: number; left?: number }
    lineHeightFactor: number
    overflow: 'linebreak' | 'ellipsize' | 'visible' | 'hidden'
  }>
}

type ExportMetaOptions = {
  letterhead?: Partial<LetterheadMeta>
}

function normalizeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return value
  }
  return value
}

function stripExtension(filename: string, ext: string) {
  const re = new RegExp(`\\.${ext}$`, 'i')
  return filename.replace(re, '')
}

let cachedOrgBrand: ResolvedOrganizationBrand | null | undefined
let cachedOrgBrandAt = 0
const ORG_CACHE_TTL_MS = 5 * 60 * 1000

async function getOrgBrandCached() {
  const now = Date.now()
  if (cachedOrgBrandAt && now - cachedOrgBrandAt < ORG_CACHE_TTL_MS) return cachedOrgBrand ?? null
  cachedOrgBrandAt = now
  cachedOrgBrand = await fetchCurrentOrganizationBrand()
  return cachedOrgBrand ?? null
}

async function resolveLetterheadMeta(args: {
  filenameBase: string
  title?: string
  letterhead?: Partial<LetterheadMeta>
}): Promise<LetterheadMeta> {
  const nowIso = new Date().toISOString()
  const orgBrand = await getOrgBrandCached()

  const baseTitle = args.title || args.letterhead?.documentTitle || args.filenameBase
  const organizationName =
    args.letterhead?.organizationName || orgBrand?.name || 'RES'

  return {
    organizationName,
    organizationLocation: args.letterhead?.organizationLocation || (orgBrand?.location ?? undefined),
    organizationPhone: args.letterhead?.organizationPhone || (orgBrand?.phone ?? undefined),
    organizationLogoUrl:
      args.letterhead?.organizationLogoUrl !== undefined
        ? args.letterhead.organizationLogoUrl
        : orgBrand?.logo_url ?? null,
    tenantName: args.letterhead?.tenantName,
    tenantPhone: args.letterhead?.tenantPhone,
    propertyName: args.letterhead?.propertyName,
    unitNumber: args.letterhead?.unitNumber,
    documentTitle: args.letterhead?.documentTitle || baseTitle,
    generatedAtISO: args.letterhead?.generatedAtISO || nowIso,
  }
}

export async function exportRowsAsCSV<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  summaryRows?: Array<Array<string | number>>,
  options?: ExportMetaOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'csv'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.letterhead?.documentTitle,
    letterhead: options?.letterhead,
  })

  const headers = columns.map((col) => col.header)
  const rows = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  exportCsvWithLetterhead({
    filenameBase,
    meta,
    headers,
    rows: rows as any,
    summaryRows,
  })
}

export async function exportRowsAsExcel<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  summaryRows?: Array<Array<string | number>>,
  options?: ExportMetaOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'xlsx'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.letterhead?.documentTitle,
    letterhead: options?.letterhead,
  })

  const headers = columns.map((col) => col.header)
  const rows = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  await exportExcelWithLetterhead({
    filenameBase,
    sheetName: 'Report',
    meta,
    headers,
    rows: rows as any,
    summaryRows,
  })
}

export async function exportRowsAsPDF<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  options?: PdfOptions
) {
  const filenameBase = safeFilename(stripExtension(filename, 'pdf'))
  const meta = await resolveLetterheadMeta({
    filenameBase,
    title: options?.title,
    letterhead: options?.letterhead,
  })

  const pdfColumns = columns.map((col) => ({
    header: col.header,
    align: col.align,
  }))

  const body = data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)) as any))

  exportTablePdf({
    filenameBase,
    meta,
    subtitle: options?.subtitle,
    columns: pdfColumns,
    body: body as any,
    summaryRows: options?.summaryRows,
    footerNote: options?.footerNote,
    orientation: options?.orientation,
    tableStyles: options?.tableStyles,
  })
}
```

## `lib/exports/csv.ts`

```ts
'use client'

import { saveAs } from 'file-saver'
import type { LetterheadMeta } from './letterhead'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}` : ''
  return `${value}`
}

function csvEscape(value: string) {
  const needsQuotes = /[",\n]/.test(value)
  const sanitized = value.replace(/"/g, '""')
  return needsQuotes ? `"${sanitized}"` : sanitized
}

export function exportCsvWithLetterhead(args: {
  filenameBase: string
  meta?: LetterheadMeta | null
  headers: string[]
  rows: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
}) {
  const lines: string[] = []

  if (args.meta) {
    const m = args.meta
    lines.push(['Organization', m.organizationName].map((v) => csvEscape(normalizeCell(v))).join(','))
    if (m.organizationLocation) {
      lines.push(['Location', m.organizationLocation].map((v) => csvEscape(normalizeCell(v))).join(','))
    }
    if (m.organizationPhone) {
      lines.push(['Phone', m.organizationPhone].map((v) => csvEscape(normalizeCell(v))).join(','))
    }
    lines.push(['Document', m.documentTitle].map((v) => csvEscape(normalizeCell(v))).join(','))
    lines.push(['Generated', m.generatedAtISO].map((v) => csvEscape(normalizeCell(v))).join(','))
    if (m.tenantName) lines.push(['Tenant', m.tenantName].map((v) => csvEscape(normalizeCell(v))).join(','))
    if (m.tenantPhone) lines.push(['Tenant Phone', m.tenantPhone].map((v) => csvEscape(normalizeCell(v))).join(','))
    if (m.propertyName) lines.push(['Property', m.propertyName].map((v) => csvEscape(normalizeCell(v))).join(','))
    if (m.unitNumber) lines.push(['Unit', m.unitNumber].map((v) => csvEscape(normalizeCell(v))).join(','))
    lines.push('') // spacer line
  }

  lines.push(args.headers.map((h) => csvEscape(normalizeCell(h))).join(','))

  for (const row of args.rows) {
    lines.push(row.map((cell) => csvEscape(normalizeCell(cell))).join(','))
  }

  if (args.summaryRows?.length) {
    lines.push('')
    for (const row of args.summaryRows) {
      lines.push(row.map((cell) => csvEscape(normalizeCell(cell))).join(','))
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `${args.filenameBase}.csv`)
}

// Backward-friendly alias name (as referenced in the implementation guide).
export const exportCsv = exportCsvWithLetterhead
```

## `lib/exports/excel.ts`

```ts
'use client'

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { LetterheadMeta } from './letterhead'
import { safeFilename } from './letterhead'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  return `${value}`
}

function computeColWidths(rows: Array<Array<string | number>>) {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const text = `${cell ?? ''}`
      const len = Math.min(60, text.length)
      widths[idx] = Math.max(widths[idx] || 10, len + 2)
    })
  }
  return widths
}

export async function exportExcelWithLetterhead(args: {
  filenameBase: string
  sheetName?: string
  meta?: LetterheadMeta | null
  headers: string[]
  rows: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = args.meta?.organizationName || 'RES'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(args.sheetName || 'Report', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 0 }],
  })

  const meta = args.meta || null
  let startRow = 1

  if (meta) {
    const maxCols = Math.max(args.headers.length, 6)

    worksheet.getRow(1).height = 30
    worksheet.getRow(2).height = 20
    worksheet.getRow(3).height = 18
    worksheet.getRow(4).height = 18

    worksheet.mergeCells(1, 1, 1, maxCols)
    const orgCell = worksheet.getCell(1, 1)
    orgCell.value = meta.organizationName || 'RES'
    orgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4867A4' } }
    orgCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    orgCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(2, 1, 2, maxCols)
    const titleCell = worksheet.getCell(2, 1)
    titleCell.value = meta.documentTitle || 'Document'
    titleCell.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

    const infoParts: string[] = [`Generated: ${meta.generatedAtISO}`]
    if (meta.organizationLocation) infoParts.push(`Location: ${meta.organizationLocation}`)
    if (meta.organizationPhone) infoParts.push(`Phone: ${meta.organizationPhone}`)

    worksheet.mergeCells(3, 1, 3, maxCols)
    const infoCell = worksheet.getCell(3, 1)
    infoCell.value = infoParts.join(' • ')
    infoCell.font = { size: 10, color: { argb: 'FF64748B' } }
    infoCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    const details: string[] = []
    if (meta.tenantName) details.push(`Tenant: ${meta.tenantName}`)
    if (meta.tenantPhone) details.push(`Tenant Phone: ${meta.tenantPhone}`)
    if (meta.propertyName) details.push(`Property: ${meta.propertyName}`)
    if (meta.unitNumber) details.push(`Unit: ${meta.unitNumber}`)

    worksheet.mergeCells(4, 1, 4, maxCols)
    const detailsCell = worksheet.getCell(4, 1)
    detailsCell.value = details.join(' • ')
    detailsCell.font = { size: 10, color: { argb: 'FF475569' } }
    detailsCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    startRow = 6
  }

  // Table headers
  const headerRowIndex = startRow
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.values = args.headers.map((h) => normalizeCell(h) as any)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4867A4' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20

  // Data rows
  let currentRow = headerRowIndex + 1
  for (const row of args.rows) {
    const r = worksheet.getRow(currentRow)
    r.values = row.map((cell) => normalizeCell(cell) as any)
    r.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    currentRow += 1
  }

  if (args.summaryRows?.length) {
    currentRow += 1
    for (const row of args.summaryRows) {
      const r = worksheet.getRow(currentRow)
      r.values = row.map((cell) => normalizeCell(cell) as any)
      r.font = { bold: true, color: { argb: 'FF0F172A' } }
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      r.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      currentRow += 1
    }
  }

  // Column widths
  const allRowsForWidth: Array<Array<string | number>> = [args.headers, ...args.rows, ...(args.summaryRows || [])]
  const widths = computeColWidths(allRowsForWidth)
  widths.forEach((wch, idx) => {
    worksheet.getColumn(idx + 1).width = Math.max(10, Math.min(60, wch))
  })

  // Freeze headers
  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${safeFilename(args.filenameBase)}.xlsx`)
}

// Backward-friendly alias name (as referenced in the implementation guide).
export const exportXlsx = exportExcelWithLetterhead
```

## `lib/exports/letterhead.ts`

```ts
'use client'

export type LetterheadMeta = {
  organizationName: string
  organizationLocation?: string
  organizationPhone?: string
  organizationLogoUrl?: string | null

  tenantName?: string
  tenantPhone?: string
  propertyName?: string
  unitNumber?: string

  documentTitle: string
  generatedAtISO: string
}

export type ResolvedOrganizationBrand = {
  name: string
  location?: string | null
  phone?: string | null
  logo_url?: string | null
}

export async function fetchCurrentOrganizationBrand(): Promise<ResolvedOrganizationBrand | null> {
  try {
    const response = await fetch('/api/organizations/current', {
      cache: 'no-store',
      credentials: 'include',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.success || !payload?.data?.name) return null
    return {
      name: String(payload.data.name),
      location: payload.data.location ?? payload.data.organization_location ?? null,
      phone: payload.data.phone_number ?? payload.data.phone ?? payload.data.organization_phone ?? null,
      logo_url: payload.data.logo_url ?? payload.data.logo ?? null,
    }
  } catch {
    return null
  }
}

export function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'export'
}

export function formatGeneratedAt(iso: string) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString()
  return parsed.toLocaleString()
}

export function buildLetterheadLines(meta: LetterheadMeta) {
  const left: string[] = []
  const right: string[] = []

  if (meta.organizationLocation) left.push(String(meta.organizationLocation))
  if (meta.organizationPhone) left.push(String(meta.organizationPhone))

  if (meta.tenantName) right.push(`Tenant: ${meta.tenantName}`)
  if (meta.tenantPhone) right.push(`Phone: ${meta.tenantPhone}`)
  if (meta.propertyName) right.push(`Property: ${meta.propertyName}`)
  if (meta.unitNumber) right.push(`Unit: ${meta.unitNumber}`)

  return { left, right }
}

```

## `lib/exports/pdf.ts`

```ts
'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LetterheadMeta } from './letterhead'
import { buildLetterheadLines, formatGeneratedAt, safeFilename } from './letterhead'

export type PdfTableColumn = {
  header: string
  align?: 'left' | 'right' | 'center'
}

export type PdfExportTableOptions = {
  filenameBase: string
  meta: LetterheadMeta
  subtitle?: string
  columns: PdfTableColumn[]
  body: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
  footerNote?: string
  orientation?: 'portrait' | 'landscape' | 'auto'
  tableStyles?: Partial<{
    fontSize: number
    cellPadding: number | { top?: number; right?: number; bottom?: number; left?: number }
    lineHeightFactor: number
    overflow: 'linebreak' | 'ellipsize' | 'visible' | 'hidden'
  }>
}

// Brand primary: elegant blend of previous blue + #606975.
const BRAND_PRIMARY_RGB: [number, number, number] = [72, 103, 164] // #4867A4
const BRAND_DARK_RGB: [number, number, number] = [15, 23, 42]
const BRAND_MUTED_RGB: [number, number, number] = [71, 85, 105]
const BORDER_RGB: [number, number, number] = [226, 232, 240]

const PAGE_MARGIN_X = 40
const FOOTER_HEIGHT = 46

function resolveOrientation(option: PdfExportTableOptions['orientation'], columnCount: number) {
  if (option === 'portrait' || option === 'landscape') return option
  return columnCount > 6 ? 'landscape' : 'portrait'
}

function computeHeaderHeight(meta: LetterheadMeta, subtitle?: string) {
  const { left, right } = buildLetterheadLines(meta)
  const lineCount = Math.max(left.length, right.length)
  const extraSubtitle = subtitle ? 1 : 0
  const base = 84
  return base + (lineCount + extraSubtitle) * 12
}

export function drawLetterhead(
  doc: jsPDF,
  opts: {
    meta: LetterheadMeta
    subtitle?: string
    headerHeight: number
    accentColor?: [number, number, number]
  }
) {
  const { meta, subtitle, headerHeight, accentColor } = opts
  const pageWidth = doc.internal.pageSize.getWidth()
  const brandColor = accentColor || BRAND_PRIMARY_RGB

  // Top bar
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 52, 'F')

  // Org name
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(meta.organizationName || 'Organization', PAGE_MARGIN_X, 30, {
    maxWidth: pageWidth - PAGE_MARGIN_X * 2,
  })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(11)
  doc.text('Property Management', PAGE_MARGIN_X, 44, {
    maxWidth: pageWidth - PAGE_MARGIN_X * 2,
  })

  // Title row
  doc.setTextColor(...BRAND_DARK_RGB)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(meta.documentTitle || 'Document', PAGE_MARGIN_X, 74)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...BRAND_MUTED_RGB)
  doc.text(`Generated: ${formatGeneratedAt(meta.generatedAtISO)}`, pageWidth - PAGE_MARGIN_X, 74, {
    align: 'right',
  })

  let cursorY = 92
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND_MUTED_RGB)
    doc.text(subtitle, PAGE_MARGIN_X, cursorY, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2,
    })
    cursorY += 16
  }

  const { left, right } = buildLetterheadLines(meta)
  const lines = Math.max(left.length, right.length)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND_DARK_RGB)

  for (let i = 0; i < lines; i += 1) {
    const leftText = left[i]
    const rightText = right[i]
    if (leftText) {
      doc.text(leftText, PAGE_MARGIN_X, cursorY)
    }
    if (rightText) {
      doc.text(rightText, pageWidth - PAGE_MARGIN_X, cursorY, { align: 'right' })
    }
    cursorY += 12
  }

  // Divider line
  doc.setDrawColor(...BORDER_RGB)
  doc.line(PAGE_MARGIN_X, headerHeight - 12, pageWidth - PAGE_MARGIN_X, headerHeight - 12)
}

export function getLetterheadHeight(meta: LetterheadMeta, subtitle?: string) {
  return computeHeaderHeight(meta, subtitle)
}

function drawFooter(doc: jsPDF, footerNote?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND_MUTED_RGB)

  if (footerNote) {
    doc.text(footerNote, PAGE_MARGIN_X, y, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2 - 70,
    })
  }

  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - PAGE_MARGIN_X, y, { align: 'right' })
}

export function exportTablePdf(options: PdfExportTableOptions) {
  const orientation = resolveOrientation(options.orientation, options.columns.length)
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation,
  })

  const headerHeight = computeHeaderHeight(options.meta, options.subtitle)
  const margin = {
    left: PAGE_MARGIN_X,
    right: PAGE_MARGIN_X,
    top: headerHeight + 8,
    bottom: FOOTER_HEIGHT,
  }

  const summaryStartIndex = options.body.length
  const rows = [...options.body, ...(options.summaryRows || [])]

  autoTable(doc, {
    margin,
    tableWidth: 'auto',
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    head: [options.columns.map((c) => c.header)],
    body: rows,
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 5,
      overflow: 'linebreak',
      cellWidth: 'wrap',
      valign: 'top',
      textColor: BRAND_DARK_RGB as any,
      lineColor: BORDER_RGB as any,
      lineWidth: 0.5,
      ...(options.tableStyles || {}),
    },
    headStyles: {
      fillColor: BRAND_PRIMARY_RGB as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      ...(options.tableStyles?.fontSize ? { fontSize: options.tableStyles.fontSize } : {}),
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      // Align columns
      const col = options.columns[data.column.index]
      if (col?.align) {
        data.cell.styles.halign = col.align
      }

      // Summary rows
      if (data.section === 'body' && data.row.index >= summaryStartIndex) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [241, 245, 249]
      }
    },
    didDrawPage: () => {
      drawLetterhead(doc, {
        meta: options.meta,
        subtitle: options.subtitle,
        headerHeight,
      })
      drawFooter(doc, options.footerNote)
    },
  })

  doc.save(`${safeFilename(options.filenameBase)}.pdf`)
}

function money(n: unknown) {
  const numberValue = Number(n ?? 0)
  return numberValue.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })
}

/**
 * Convenience wrapper matching the statement-ledger shape (entry_date/entry_type/debit/credit/running_balance).
 * Prefer using `exportTablePdf` for custom reports.
 */
export async function exportStatementPdf(meta: LetterheadMeta, rows: any[]) {
  const filenameBase = safeFilename(meta.documentTitle || 'statement')

  const body = (rows || []).map((r: any) => [
    r.entry_date ?? r.posted_at ?? '',
    r.entry_type ?? r.type ?? '',
    r.description ?? '',
    r.debit ? money(r.debit) : '',
    r.credit ? money(r.credit) : '',
    money(r.running_balance ?? r.balance_after ?? r.balance ?? 0),
  ])

  exportTablePdf({
    filenameBase,
    meta,
    columns: [
      { header: 'Date' },
      { header: 'Type' },
      { header: 'Description' },
      { header: 'Debit', align: 'right' },
      { header: 'Credit', align: 'right' },
      { header: 'Balance', align: 'right' },
    ],
    body,
    footerNote:
      'Disclaimer: If any item on this statement is disputed, please contact management immediately.',
  })
}
```

## `lib/supabase/admin.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

/**
 * Create Supabase admin client with service role key
 * Use this ONLY for server-side admin operations
 * NEVER expose the service role key to the client
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '[Supabase Admin] Missing env variables (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY). Returning null client.'
    )
    return null
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
```

## `lib/supabase/client.ts`

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    console.error(
      '[Supabase Client] Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )

    return createBrowserClient<Database>(
      'https://placeholder.supabase.co',
      'public-anon-key'
    )
  }

  return createBrowserClient<Database>(supabaseUrl, anonKey)
}
```

## `lib/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from './database.types'

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    console.error(
      '[Supabase SSR] Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
    // Return a dummy client so login page doesn't crash
    return createServerClient('https://placeholder.supabase.co', 'public-anon-key', {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    })
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}
```

## `lib/supabase/types.ts`

```ts
import { Database } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface User {
  id: string
  email?: string
  phone?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
    [key: string]: any
  }
  app_metadata?: {
    provider?: string
    [key: string]: any
  }
  created_at?: string
  updated_at?: string
}

export interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
  user: User
}

export interface AuthError {
  message: string
  status?: number
  name?: string
}

```

## `lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

