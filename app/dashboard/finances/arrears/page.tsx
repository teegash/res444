'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { ArrowLeft } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

ModuleRegistry.registerModules([AllCommunityModule])

type ArrearsRow = {
  organization_id: string
  lease_id: string
  tenant_user_id: string
  tenant_name: string | null
  tenant_phone: string | null
  unit_id: string | null
  unit_number: string | null
  arrears_amount: number
  open_invoices_count: number
  oldest_due_date: string | null
  building_id: string | null
  building_name: string | null
  building_location: string | null
}

type Building = {
  id: string
  name: string
  location: string | null
}

function formatKES(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

function toDateOnly(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function isOverdueTwoMonths(oldestDue?: string | null) {
  const due = toDateOnly(oldestDue)
  if (!due) return false
  const today = new Date()
  const threshold = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, today.getUTCDate()))
  return due.getTime() <= threshold.getTime()
}

export default function ArrearsPage() {
  const router = useRouter()
  const gridApiRef = useRef<GridApi | null>(null)
  const [rows, setRows] = useState<ArrearsRow[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [buildingId, setBuildingId] = useState<string>('all')
  const [minArrears, setMinArrears] = useState<string>('0')
  const [summary, setSummary] = useState<{
    active_tenants: number
    defaulters: number
    defaulters_pct: number
    total_arrears_amount: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const colDefs = useMemo<ColDef<ArrearsRow>[]>(() => {
    return [
      { headerName: 'Unit', field: 'unit_number', width: 110 },
      { headerName: 'Tenant', field: 'tenant_name', minWidth: 180, flex: 1 },
      { headerName: 'Phone', field: 'tenant_phone', minWidth: 140 },
      { headerName: 'Building', field: 'building_name', minWidth: 160, flex: 1 },
      {
        headerName: 'Arrears',
        field: 'arrears_amount',
        minWidth: 140,
        valueFormatter: (p) => formatKES(Number(p.value || 0)),
        cellClass: (p) => {
          if (!p.data) return ''
          if (isOverdueTwoMonths(p.data.oldest_due_date)) return 'text-red-600 font-semibold'
          return Number(p.value || 0) > 0 ? 'text-orange-500 font-semibold' : ''
        },
      },
      { headerName: 'Oldest Due', field: 'oldest_due_date', minWidth: 130 },
      { headerName: 'Open Invoices', field: 'open_invoices_count', minWidth: 120 },
      {
        headerName: 'Actions',
        minWidth: 210,
        cellRenderer: (p: any) => {
          const row = p.data as ArrearsRow | undefined
          if (!row?.tenant_user_id) return <span className="text-slate-400">—</span>
          const statementHref = `/dashboard/manager/statements/${row.tenant_user_id}?leaseId=${row.lease_id}`
          const leaseHref = `/dashboard/tenants/${row.tenant_user_id}/lease`
          return (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push(leaseHref)}>
                View Lease
              </Button>
              <Button size="sm" onClick={() => router.push(statementHref)}>
                View Stmt
              </Button>
            </div>
          )
        },
      },
    ]
  }, [router])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sRes = await fetch('/api/dashboard/manager/defaulters-summary', { cache: 'no-store' })
        const sJson = await sRes.json()
        if (sRes.ok && sJson.success && mounted) setSummary(sJson.data)

        const bRes = await fetch('/api/manager/buildings', { cache: 'no-store' })
        const bJson = await bRes.json()
        if (bRes.ok && bJson.success && mounted) setBuildings(bJson.data || [])
      } catch (e) {
        // Summary/buildings are optional; keep silent if they fail.
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams()
        if (buildingId !== 'all') params.set('building_id', buildingId)
        const min = Number(minArrears || '0')
        if (Number.isFinite(min) && min > 0) params.set('min_arrears', String(min))
        const res = await fetch(`/api/finance/arrears?${params.toString()}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load arrears')
        if (mounted) setRows(json.data || [])
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load arrears')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [buildingId, minArrears])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((r) => {
      const unit = (r.unit_number ?? '').toLowerCase()
      const name = (r.tenant_name ?? '').toLowerCase()
      const phone = (r.tenant_phone ?? '').toLowerCase()
      const building = (r.building_name ?? '').toLowerCase()
      return unit.includes(query) || name.includes(query) || phone.includes(query) || building.includes(query)
    })
  }, [rows, q])

  useEffect(() => {
    gridApiRef.current?.setGridOption('quickFilterText', q)
  }, [q])

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <Button variant="ghost" className="gap-2 px-0" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Rent Arrears</h1>
                  <p className="text-sm text-muted-foreground">
                    Rent-only arrears computed from unpaid/overdue rent invoices.
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-96">
                <Input
                  placeholder="Search unit, tenant, phone…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            {summary && (
              <Card className="border-0 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-md">
                <CardContent className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border bg-white/90 p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground">Active tenants</p>
                    <p className="text-[clamp(1rem,2.2vw,1.5rem)] font-bold text-slate-900 whitespace-nowrap leading-none">
                      {summary.active_tenants} Tenants
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white/90 p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground">Defaulters</p>
                    <p className="text-[clamp(1rem,2.2vw,1.5rem)] font-bold text-rose-700 whitespace-nowrap leading-none">
                      {summary.defaulters} Tenants
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white/90 p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground">Defaulters rate</p>
                    <p className="text-[clamp(1rem,2.2vw,1.5rem)] font-bold text-amber-700 whitespace-nowrap leading-none">
                      {summary.defaulters_pct}%
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white/90 p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground">Total arrears</p>
                    <p className="text-[clamp(1rem,2.2vw,1.5rem)] font-bold text-slate-900 whitespace-nowrap leading-none">
                      {formatKES(summary.total_arrears_amount || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-3 flex-wrap items-center">
                <div className="w-full sm:w-72">
                  <select
                    className="w-full border rounded-md h-10 px-3 text-sm bg-white"
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                  >
                    <option value="all">All buildings</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full sm:w-56">
                  <Input
                    placeholder="Min arrears (KES)"
                    value={minArrears}
                    onChange={(e) => setMinArrears(e.target.value)}
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setBuildingId('all')
                    setMinArrears('0')
                    setQ('')
                  }}
                >
                  Reset
                </Button>
              </CardContent>
            </Card>

            {loading && (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">Loading arrears…</CardContent>
              </Card>
            )}

            {error && (
              <Card>
                <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
              </Card>
            )}

            {!loading && !error && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Leases in arrears ({filtered.length})</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    Orange = recent • Red = 2+ months overdue
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="ag-theme-quartz w-full h-[520px] rounded-xl border border-slate-200 bg-white shadow-sm">
                    <AgGridReact<ArrearsRow>
                      rowData={filtered}
                      columnDefs={colDefs}
                      defaultColDef={{
                        sortable: true,
                        resizable: true,
                        filter: true,
                        floatingFilter: false,
                        minWidth: 110,
                      }}
                      suppressHorizontalScroll
                      pagination
                      paginationPageSize={25}
                      rowSelection={{ mode: 'single' }}
                      theme="legacy"
                      onGridReady={(params) => {
                        gridApiRef.current = params.api
                        params.api.setGridOption('quickFilterText', q)
                        params.api.sizeColumnsToFit()
                      }}
                      onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
