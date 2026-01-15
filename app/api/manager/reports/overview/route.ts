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
    const paymentEndExclusive = endExclusiveIso(range.end)

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
          status,
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

    const validLeaseStatuses = new Set(['active', 'renewed', 'ended', 'expired', 'valid'])
    const filteredInvoices = (invoices || []).filter((i: any) => {
      const leaseStatus = String(i?.lease?.status || '').toLowerCase()
      return validLeaseStatuses.has(leaseStatus)
    })
    const scopedInvoices = scopePropertyId
      ? filteredInvoices.filter((i: any) => i.lease?.unit?.building?.id === scopePropertyId)
      : filteredInvoices

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
          invoice_type,
          status_text,
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

    if (range.start) paymentQuery = paymentQuery.gte('payment_date', range.start)
    if (paymentEndExclusive) paymentQuery = paymentQuery.lt('payment_date', paymentEndExclusive)

    const { data: payments, error: payErr } = await paymentQuery
    if (payErr) throw payErr

    const filteredPayments = (payments || []).filter((p: any) => {
      const leaseStatus = String(p?.invoice?.lease?.status || '').toLowerCase()
      return validLeaseStatuses.has(leaseStatus)
    })
    const scopedPayments = scopePropertyId
      ? filteredPayments.filter((p: any) => p.invoice?.lease?.unit?.building?.id === scopePropertyId)
      : filteredPayments
    const validPayments = scopedPayments.filter((p: any) => {
      const invType = String(p.invoice?.invoice_type || '').toLowerCase()
      const invStatus = String(p.invoice?.status_text || '').toLowerCase()
      if (invStatus === 'void') return false
      if (invType && invType !== 'rent' && invType !== 'water') return false
      return true
    })
    const paidInvoiceIds = new Set<string>(
      validPayments
        .map((p: any) => p.invoice?.id)
        .filter((id: string | null | undefined): id is string => Boolean(id))
    )
    const paidInvoiceFallbacks = scopedInvoices.filter((inv: any) => {
      const statusText = String(inv.status_text || '').toLowerCase()
      if (statusText !== 'paid') return false
      return !paidInvoiceIds.has(inv.id)
    })

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
    const collected =
      validPayments.reduce((sum: number, row: any) => sum + Number(row.amount_paid || 0), 0) +
      paidInvoiceFallbacks.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0)
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

    for (const payment of validPayments) {
      const d = isoDate(payment.payment_date)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, unpaid: 0, collected: 0, expenses: 0, net: 0 }
      series[key].collected += Number(payment.amount_paid || 0)
    }
    for (const inv of paidInvoiceFallbacks) {
      const d = isoDate(inv.period_start) || isoDate(inv.due_date)
      if (!d) continue
      const key = bucketKey(d, groupBy)
      series[key] ||= { period: key, billed: 0, unpaid: 0, collected: 0, expenses: 0, net: 0 }
      series[key].collected += Number(inv.amount || 0)
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

    for (const payment of validPayments) {
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
    for (const inv of paidInvoiceFallbacks) {
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
      byProperty[pid].collected += Number(inv.amount || 0)
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
