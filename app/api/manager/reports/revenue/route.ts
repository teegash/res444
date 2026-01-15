import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bucketKey, defaultGroupBy, resolveRange, safePct } from '../utils'

type GroupBy = 'day' | 'week' | 'month'

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : null
}

function endExclusiveIso(endIso: string | null | undefined) {
  if (!endIso) return null
  const d = new Date(`${endIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
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
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 })
    }

    const orgId = membership.organization_id
    const range = resolveRange({ period, startDate, endDate })
    const groupBy: GroupBy = groupByParam || defaultGroupBy(range.start, range.end)
    const scopePropertyId = propertyId !== 'all' ? propertyId : null
    const paymentEndExclusive = endExclusiveIso(range.end)

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    const propNameById = new Map((properties || []).map((p: any) => [p.id, p.name]))

    let invQ = admin
      .from('invoices')
      .select(
        `
        id,
        amount,
        invoice_type,
        status_text,
        due_date,
        period_start,
        lease:leases!invoices_lease_org_fk (
          status,
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .in('invoice_type', ['rent', 'water'])

    if (range.start) invQ = invQ.gte('period_start', range.start)
    invQ = invQ.lte('period_start', range.end)

    const { data: invoices, error: invErr } = await invQ
    if (invErr) throw invErr

    const validLeaseStatuses = new Set(['active', 'renewed', 'ended', 'expired', 'valid'])
    const filteredInvoices = (invoices || []).filter((i: any) => {
      const leaseStatus = String(i?.lease?.status || '').toLowerCase()
      return validLeaseStatuses.has(leaseStatus)
    })
    const scopedInvoices = scopePropertyId
      ? filteredInvoices.filter((i: any) => i.lease?.unit?.building?.id === scopePropertyId)
      : filteredInvoices

    let payQ = admin
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
            status,
            unit:apartment_units (
              building:apartment_buildings!apartment_units_building_org_fk ( id, name )
            )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .eq('verified', true)

    if (range.start) payQ = payQ.gte('payment_date', range.start)
    if (paymentEndExclusive) payQ = payQ.lt('payment_date', paymentEndExclusive)

    const { data: payments, error: payErr } = await payQ
    if (payErr) throw payErr

    const filteredPayments = (payments || []).filter((p: any) => {
      const leaseStatus = String(p?.invoice?.lease?.status || '').toLowerCase()
      return validLeaseStatuses.has(leaseStatus)
    })
    const scopedPayments = scopePropertyId
      ? filteredPayments.filter((p: any) => p.invoice?.lease?.unit?.building?.id === scopePropertyId)
      : filteredPayments

    const billedRent = scopedInvoices
      .filter((i: any) => i.invoice_type === 'rent')
      .reduce((a: number, x: any) => a + Number(x.amount || 0), 0)

    const billedWater = scopedInvoices
      .filter((i: any) => i.invoice_type === 'water')
      .reduce((a: number, x: any) => a + Number(x.amount || 0), 0)

    const billedTotal = billedRent + billedWater
    const collectedTotal = scopedPayments.reduce((a: number, p: any) => a + Number(p.amount_paid || 0), 0)
    const collectionRate = safePct(collectedTotal, billedTotal)

    const start = range.start ? new Date(range.start) : null
    const end = new Date(range.end)
    const days = start ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : 365
    const avgMonthlyCollected = (collectedTotal * 30) / Math.max(1, days)

    const series: Record<string, any> = {}
    const ensure = (k: string) =>
      (series[k] ||= {
        period: k,
        billedTotal: 0,
        billedRent: 0,
        billedWater: 0,
        collectedTotal: 0,
        collectionRate: 0,
      })

    for (const inv of scopedInvoices) {
      const d = isoDate(inv.period_start)
      if (!d) continue
      const k = bucketKey(d, groupBy)
      ensure(k)
      const amt = Number(inv.amount || 0)
      series[k].billedTotal += amt
      if (inv.invoice_type === 'rent') series[k].billedRent += amt
      if (inv.invoice_type === 'water') series[k].billedWater += amt
    }

    for (const pay of scopedPayments) {
      const d = isoDate(pay.payment_date)
      if (!d) continue
      const k = bucketKey(d, groupBy)
      ensure(k)
      series[k].collectedTotal += Number(pay.amount_paid || 0)
    }

    const timeseries = Object.values(series)
      .map((row: any) => ({ ...row, collectionRate: safePct(row.collectedTotal, row.billedTotal) }))
      .sort((a: any, b: any) => a.period.localeCompare(b.period))

    const todayIso = new Date().toISOString().slice(0, 10)
    const byProperty: Record<string, any> = {}

    const ensureProp = (pid: string) =>
      (byProperty[pid] ||= {
        propertyId: pid,
        propertyName: propNameById.get(pid) || 'Property',
        billedTotal: 0,
        billedRent: 0,
        billedWater: 0,
        collectedTotal: 0,
        arrearsNow: 0,
        collectionRate: 0,
      })

    for (const inv of scopedInvoices) {
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      ensureProp(pid)
      const amt = Number(inv.amount || 0)
      byProperty[pid].billedTotal += amt
      if (inv.invoice_type === 'rent') byProperty[pid].billedRent += amt
      if (inv.invoice_type === 'water') byProperty[pid].billedWater += amt

      const overdue = isoDate(inv.due_date) ? isoDate(inv.due_date)! < todayIso : false
      const unpaid = String(inv.status_text || '').toLowerCase() !== 'paid'
      if (overdue && unpaid) byProperty[pid].arrearsNow += amt
    }

    for (const pay of scopedPayments) {
      const pid = pay.invoice?.lease?.unit?.building?.id
      if (!pid) continue
      ensureProp(pid)
      byProperty[pid].collectedTotal += Number(pay.amount_paid || 0)
    }

    const byPropertyRows = Object.values(byProperty)
      .map((r: any) => ({ ...r, collectionRate: safePct(r.collectedTotal, r.billedTotal) }))
      .sort((a: any, b: any) => b.collectedTotal - a.collectedTotal)

    const topProperties = byPropertyRows.slice(0, 10).map((r: any) => ({
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      collectedTotal: r.collectedTotal,
    }))

    const bestProperty = byPropertyRows.length
      ? byPropertyRows.reduce((best: any, r: any) =>
          r.collectionRate > best.collectionRate ? r : best
        )
      : null

    const worstProperty = byPropertyRows.length
      ? byPropertyRows.reduce((worst: any, r: any) =>
          r.collectionRate < worst.collectionRate ? r : worst
        )
      : null

    return NextResponse.json({
      success: true,
      data: {
        range,
        groupBy,
        properties: properties || [],
        kpis: {
          billedTotal,
          collectedTotal,
          collectionRate,
          billedRent,
          billedWater,
          avgMonthlyCollected,
          bestProperty: bestProperty
            ? { name: bestProperty.propertyName, rate: bestProperty.collectionRate }
            : null,
          worstProperty: worstProperty
            ? { name: worstProperty.propertyName, rate: worstProperty.collectionRate }
            : null,
        },
        timeseries,
        byProperty: byPropertyRows,
        topProperties,
      },
    })
  } catch (e: any) {
    console.error('[Reports.Revenue] Failed', e)
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to load revenue report.' },
      { status: 500 }
    )
  }
}
