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
