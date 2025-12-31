'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui/skeletons'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

ModuleRegistry.registerModules([AllCommunityModule])

type PropertyOption = { id: string; name: string; location?: string | null }
type UnitOption = { id: string; unit_number: string }

type Row = {
  property_id: string
  property_name: string
  unit_id: string
  unit_number: string
  year: number
  rent_collected: number
  maintenance_spend: number
  net_income: number
  maintenance_to_collections_ratio: number | null
}

type Summary = {
  year: number
  units: number
  total_collected: number
  total_maintenance_spend: number
  total_other_expenses: number
  total_net_income: number
  overall_ratio: number | null
  units_with_zero_collections: number
}

const fmtKES = (value: number) => `KES ${Math.round(value).toLocaleString()}`
const fmtPct = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

export default function MaintenancePerformanceReportPage() {
  const nowYear = new Date().getFullYear()
  const years = useMemo(
    () => Array.from({ length: 6 }).map((_, index) => String(nowYear - index)),
    [nowYear]
  )

  const router = useRouter()
  const gridApiRef = useRef<GridApi | null>(null)

  const [year, setYear] = useState(String(nowYear))
  const [propertyId, setPropertyId] = useState('all')
  const [unitId, setUnitId] = useState('all')

  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])

  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<Row | null>(null)

  const computeFlag = (row: Row) => {
    if ((row.rent_collected || 0) <= 0) return { text: 'No collections', variant: 'secondary' as const }
    const ratio = row.maintenance_to_collections_ratio
    if (ratio != null && ratio >= 0.2) return { text: 'High spend', variant: 'destructive' as const }
    if (ratio != null && ratio >= 0.1) return { text: 'Watch', variant: 'default' as const }
    return null
  }

  const colDefs = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: 'Property', field: 'property_name', flex: 1, minWidth: 180, filter: true },
      { headerName: 'Unit', field: 'unit_number', width: 120, filter: true },
      {
        headerName: 'Collected (KES)',
        field: 'rent_collected',
        width: 170,
        filter: 'agNumberColumnFilter',
        valueFormatter: (params) => fmtKES(Number(params.value || 0)),
      },
      {
        headerName: 'Maintenance Spend (KES)',
        field: 'maintenance_spend',
        width: 210,
        filter: 'agNumberColumnFilter',
        valueFormatter: (params) => fmtKES(Number(params.value || 0)),
      },
      {
        headerName: 'Net (KES)',
        field: 'net_income',
        width: 170,
        filter: 'agNumberColumnFilter',
        valueFormatter: (params) => fmtKES(Number(params.value || 0)),
      },
      {
        headerName: 'Ratio',
        field: 'maintenance_to_collections_ratio',
        width: 120,
        valueFormatter: (params) => fmtPct(params.value ?? null),
        comparator: (a, b) => {
          if (a == null && b == null) return 0
          if (a == null) return 1
          if (b == null) return -1
          return a - b
        },
      },
      {
        headerName: 'Flag',
        width: 150,
        valueGetter: (params) => {
          const row = params.data as Row
          if (!row) return ''
          if ((row.rent_collected || 0) <= 0) return 'No collections'
          const ratio = row.maintenance_to_collections_ratio
          if (ratio != null && ratio >= 0.2) return 'High spend'
          if (ratio != null && ratio >= 0.1) return 'Watch'
          return ''
        },
        cellRenderer: (params: any) => {
          const value = params.value as string
          if (!value) return '—'
          if (value === 'High spend') return <Badge variant="destructive">{value}</Badge>
          if (value === 'Watch') return <Badge>{value}</Badge>
          return <Badge variant="secondary">{value}</Badge>
        },
        filter: true,
      },
    ],
    []
  )

  const loadProperties = async () => {
    const response = await fetch('/api/manager/properties/list', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Failed to load properties.')
    setProperties(payload.data || [])
  }

  const loadUnitsForProperty = async (pid: string) => {
    if (!pid || pid === 'all') {
      setUnits([])
      return
    }
    const response = await fetch(`/api/properties/${pid}/units?buildingId=${pid}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Failed to load units.')
    const list = (payload.data?.units || []).map((unit: any) => ({
      id: unit.id,
      unit_number: unit.unit_number,
    }))
    setUnits(list)
  }

  const loadReport = async (opts?: { year?: string; propertyId?: string; unitId?: string }) => {
    const activeYear = opts?.year ?? year
    const activeProperty = opts?.propertyId ?? propertyId
    const activeUnit = opts?.unitId ?? unitId

    const qs = new URLSearchParams({ year: activeYear })
    if (activeProperty && activeProperty !== 'all') qs.set('propertyId', activeProperty)
    if (activeUnit && activeUnit !== 'all') qs.set('unitId', activeUnit)

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/manager/reports/unit-maintenance-performance?${qs.toString()}`,
        { cache: 'no-store' }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Failed to load report.')
      setRows(payload.data || [])
      setSummary(payload.summary || null)
    } catch (err) {
      setRows([])
      setSummary(null)
      setError(err instanceof Error ? err.message : 'Failed to load report.')
    } finally {
      setLoading(false)
      if (gridApiRef.current) {
        gridApiRef.current.setGridOption('quickFilterText', search)
      }
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        await loadProperties()
        await loadReport({ year: String(nowYear), propertyId: 'all', unitId: 'all' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize report.')
      } finally {
        setLoading(false)
      }
    })()
  }, [nowYear])

  useEffect(() => {
    ;(async () => {
      try {
        setUnitId('all')
        await loadUnitsForProperty(propertyId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load units.')
      }
    })()
  }, [propertyId])

  const handleApply = async () => {
    await loadReport()
  }

  const handleReset = async () => {
    setYear(String(nowYear))
    setPropertyId('all')
    setUnitId('all')
    setSearch('')
    if (gridApiRef.current) {
      gridApiRef.current.setGridOption('quickFilterText', '')
    }
    await loadReport({ year: String(nowYear), propertyId: 'all', unitId: 'all' })
  }

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `maintenance-performance-${year}-${propertyId}-${unitId}-${new Date()
      .toISOString()
      .slice(0, 10)}`
    const generatedAtISO = new Date().toISOString()
    const letterhead = { documentTitle: 'Maintenance Performance', generatedAtISO }

    const visibleRows: Row[] = []
    gridApiRef.current?.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) visibleRows.push(node.data)
    })

    const columns = [
      { header: 'Property', accessor: (row: Row) => row.property_name },
      { header: 'Unit', accessor: (row: Row) => row.unit_number },
      { header: 'Year', accessor: (row: Row) => String(row.year) },
      { header: 'Collected (KES)', accessor: (row: Row) => fmtKES(row.rent_collected) },
      { header: 'Maintenance Spend (KES)', accessor: (row: Row) => fmtKES(row.maintenance_spend) },
      { header: 'Net Income (KES)', accessor: (row: Row) => fmtKES(row.net_income) },
      { header: 'Spend Ratio', accessor: (row: Row) => fmtPct(row.maintenance_to_collections_ratio) },
    ]

    const summaryRows = summary
      ? [
          [
            'TOTALS',
            '',
            String(summary.year),
            fmtKES(summary.total_collected),
            fmtKES(summary.total_maintenance_spend),
            fmtKES(summary.total_net_income),
            fmtPct(summary.overall_ratio),
          ],
        ]
      : []

    if (format === 'pdf') {
      exportRowsAsPDF(filename, columns, visibleRows, {
        title: 'Maintenance Performance',
        subtitle: `Year: ${year}. Landlord maintenance spend vs verified rent collected per unit.`,
        summaryRows,
        letterhead,
        orientation: 'landscape',
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(filename, columns, visibleRows, summaryRows, { letterhead })
    } else {
      exportRowsAsCSV(filename, columns, visibleRows, summaryRows, { letterhead })
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/manager/reports">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">Maintenance Performance</h1>
                <p className="text-sm text-muted-foreground">
                  Annual landlord maintenance spend vs verified rent collected, per unit.
                </p>
              </div>
            </div>

            <Card className="border-0 shadow-sm bg-white/90">
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px] md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 w-full"
                    placeholder="Quick filter"
                    value={search}
                    onChange={(event) => {
                      const value = event.target.value
                      setSearch(value)
                      gridApiRef.current?.setGridOption('quickFilterText', value)
                    }}
                  />
                </div>

                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Property" />
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

                <Select value={unitId} onValueChange={setUnitId} disabled={propertyId === 'all'}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All units</SelectItem>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.unit_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button onClick={handleApply}>Apply</Button>
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>

                <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                  <Button variant="outline" onClick={() => handleExport('pdf')}>
                    <Download className="h-4 w-4 mr-2" /> PDF
                  </Button>
                  <Button variant="outline" onClick={() => handleExport('excel')}>
                    <Download className="h-4 w-4 mr-2" /> Excel
                  </Button>
                  <Button variant="outline" onClick={() => handleExport('csv')}>
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <Card className="border-0 shadow bg-white/90">
              <CardContent className="p-4">
                <p className="text-sm text-red-600">{error}</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Snapshot</CardTitle>
              <CardDescription>Totals for the current filter scope.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-6 gap-4">
              {loading || !summary ? (
                <>
                  <SkeletonLoader height={56} width="100%" />
                  <SkeletonLoader height={56} width="100%" />
                  <SkeletonLoader height={56} width="100%" />
                  <SkeletonLoader height={56} width="100%" />
                  <SkeletonLoader height={56} width="100%" />
                  <SkeletonLoader height={56} width="100%" />
                </>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white border">
                    <p className="text-xs text-muted-foreground">Total collected</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {fmtKES(summary.total_collected)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-rose-50 to-white border">
                    <p className="text-xs text-muted-foreground">Maintenance spend</p>
                    <p className="text-2xl font-bold text-rose-700">
                      {fmtKES(summary.total_maintenance_spend)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-white border">
                    <p className="text-xs text-muted-foreground">Other expenses</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {fmtKES(summary.total_other_expenses)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border">
                    <p className="text-xs text-muted-foreground">Net income</p>
                    <p className="text-2xl font-bold">{fmtKES(summary.total_net_income)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white border">
                    <p className="text-xs text-muted-foreground">Overall ratio</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {fmtPct(summary.overall_ratio)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-white border">
                    <p className="text-xs text-muted-foreground">Units with 0 collections</p>
                    <p className="text-2xl font-bold text-amber-700">
                      {summary.units_with_zero_collections}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle>Units</CardTitle>
              <CardDescription>Table with sorting, filtering, and exports.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <SkeletonLoader height={520} width="100%" />
              ) : (
                <div
                  className="ag-theme-quartz premium-grid w-full rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]"
                  style={{ height: 560 }}
                >
                  <AgGridReact<Row>
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{
                      sortable: true,
                      resizable: true,
                      filter: true,
                      floatingFilter: true,
                    }}
                    pagination={true}
                    paginationPageSize={25}
                    animateRows={true}
                    rowSelection="single"
                    onGridReady={(params) => {
                      gridApiRef.current = params.api
                      params.api.setGridOption('quickFilterText', search)
                      params.api.applyColumnState({
                        state: [
                          { colId: 'maintenance_to_collections_ratio', sort: 'desc' },
                          { colId: 'maintenance_spend', sort: 'desc' },
                        ],
                      })
                    }}
                    onRowClicked={(event) => {
                      if (!event.data) return
                      setSelectedRow(event.data)
                      setDetailOpen(true)
                      event.node.setSelected(true)
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setSelectedRow(null)
        }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Unit performance details</DialogTitle>
            <DialogDescription>
              Snapshot for the selected unit and year (cash collections vs landlord maintenance spend).
            </DialogDescription>
          </DialogHeader>

          {selectedRow ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Property</p>
                  <p className="text-base font-semibold">{selectedRow.property_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Unit</p>
                  <p className="text-base font-semibold">{selectedRow.unit_number}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Year</p>
                  <p className="text-base font-semibold">{selectedRow.year}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Flag</p>
                  {(() => {
                    const flag = computeFlag(selectedRow)
                    return flag ? (
                      <Badge variant={flag.variant}>{flag.text}</Badge>
                    ) : (
                      <span className="text-sm">—</span>
                    )
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {fmtKES(selectedRow.rent_collected)}
                  </p>
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Maintenance spend</p>
                  <p className="text-lg font-bold text-rose-700">
                    {fmtKES(selectedRow.maintenance_spend)}
                  </p>
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Net income</p>
                  <p className="text-lg font-bold">{fmtKES(selectedRow.net_income)}</p>
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <p className="text-xs text-muted-foreground">Spend ratio</p>
                  <p className="text-lg font-bold text-blue-700">
                    {fmtPct(selectedRow.maintenance_to_collections_ratio)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-sm text-muted-foreground">Notes:</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>Collected is based on verified rent payments for the selected year.</li>
                  <li>Maintenance spend includes landlord-paid maintenance costs only.</li>
                  <li>Ratio is blank when collections are zero.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">No row selected.</div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>

            <Button
              variant="secondary"
              disabled={!selectedRow}
              onClick={() => {
                if (!selectedRow) return
                const qs = new URLSearchParams()
                qs.set('unitId', selectedRow.unit_id)
                qs.set('propertyId', selectedRow.property_id)
                qs.set('year', String(selectedRow.year))
                router.push(`/dashboard/maintenance?${qs.toString()}`)
                setDetailOpen(false)
              }}
            >
              View maintenance requests
            </Button>

            <Button
              disabled={!selectedRow}
              onClick={() => {
                if (!selectedRow) return
                router.push(
                  `/dashboard/manager/properties/${selectedRow.property_id}?unitId=${selectedRow.unit_id}`
                )
                setDetailOpen(false)
              }}
            >
              View unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
