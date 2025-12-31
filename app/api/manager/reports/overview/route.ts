import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bucketKey, defaultGroupBy, resolveRange, safePct } from '../utils'

type GroupBy = 'day' | 'week' | 'month'

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : null
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
        invoice_type,
        status_text,
        due_date,
        period_start,
        lease:leases!invoices_lease_org_fk (
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

    let expenses: any[] = []
    try {
      let expQuery = admin
        .from('expenses')
        .select('id, amount, incurred_at, created_at, property_id, organization_id')
        .eq('organization_id', orgId)

      if (range.start) expQuery = expQuery.gte('created_at', range.start)
      expQuery = expQuery.lte('created_at', range.end)

      const res = await expQuery
      if (res.error) throw res.error
      expenses = res.data || []
    } catch (err) {
      let expQuery = admin
        .from('expenses')
        .select('id, amount, incurred_at, property_id, organization_id')
        .eq('organization_id', orgId)

      if (range.start) expQuery = expQuery.gte('incurred_at', range.start)
      expQuery = expQuery.lte('incurred_at', range.end)

      const res = await expQuery
      if (res.error) throw res.error
      expenses = res.data || []
    }

    const scopedExpenses = scopePropertyId
      ? expenses.filter((item: any) => item.property_id === scopePropertyId)
      : expenses

    const billed = scopedInvoices.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
    const collected = scopedPayments.reduce((sum: number, row: any) => sum + Number(row.amount_paid || 0), 0)
    const totalExpenses = scopedExpenses.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
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
      { period: string; billed: number; collected: number; expenses: number; net: number }
    > = {}

    for (const inv of scopedInvoices) {
      const d = isoDate(inv.period_start)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, collected: 0, expenses: 0, net: 0 }
      series[key].billed += Number(inv.amount || 0)
    }

    for (const payment of scopedPayments) {
      const d = isoDate(payment.payment_date)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, collected: 0, expenses: 0, net: 0 }
      series[key].collected += Number(payment.amount_paid || 0)
    }

    for (const expense of scopedExpenses) {
      const d = isoDate(expense.incurred_at) || isoDate(expense.created_at)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, collected: 0, expenses: 0, net: 0 }
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

    for (const expense of scopedExpenses) {
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
