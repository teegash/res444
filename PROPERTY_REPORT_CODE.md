# Property Report Implementation

This document contains the current source code for the Property Report routes and UI.

## API Route

`app/api/manager/reports/benchmark/route.ts`

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

```

## Property Report Page

`app/dashboard/manager/reports/benchmark/page.tsx`

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
        acc.occupancySum += Number(row.occupancyRate || 0)
        return acc
      },
      { collected: 0, billed: 0, arrears: 0, noi: 0, occupancySum: 0 }
    )

    const avgOccupancy = rows.length ? totals.occupancySum / rows.length : 0
    const collectionRate = safePct(totals.collected, totals.billed)
    const noiMargin = safePct(totals.noi, totals.collected)
    const billedBaseline = Math.max(1, totals.billed)

    return {
      totalCollected: totals.collected,
      totalBilled: totals.billed,
      totalArrears: totals.arrears,
      totalNOI: totals.noi,
      avgOccupancy,
      collectionRate,
      noiMargin,
      billedBaseline,
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
                <h1 className="text-2xl font-semibold tracking-tight">Property Report</h1>
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
                  subtitle="Avg across properties"
                  value={radial.avgOccupancy}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Math.round(n)}%`}
                />
                <RadialMiniKpi
                  title="NOI Margin"
                  subtitle="NOI / Collected"
                  value={radial.noiMargin}
                  max={100}
                  ringLabel="%"
                  valueFormatter={(n) => `${Math.round(n)}%`}
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

## Radial Mini KPI Component

`components/reports/benchmark/RadialMiniKpi.tsx`

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

## ECharts Wrapper

`components/charts/EChart.tsx`

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

## Export Helpers

`lib/export/download.ts`

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
