'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/lib/auth/context'

import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

ModuleRegistry.registerModules([AllCommunityModule])

type Property = { id: string; name: string | null; location: string | null }

type BulkRow = {
  unit_id: string
  unit_number: string | null
  tenant_user_id: string | null
  tenant_name: string | null
  tenant_phone: string | null
  tenant_email: string | null
  previous_reading: number | null
  current_reading: number | null
  price_per_unit: number
  units_consumed: number
  amount: number
  validation_status: 'Valid' | 'Invalid'
  validation_error: string
  send_status: 'Pending' | 'Sent' | 'Failed' | 'Skipped'
  send_message?: string
  invoice_id?: string
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toNumberOrNull(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function computeRow(row: BulkRow): BulkRow {
  const prev = row.previous_reading ?? 0
  const curr = row.current_reading
  const rate = row.price_per_unit ?? 0

  const consumed = curr === null ? 0 : Math.max(0, curr - prev)
  const amount = Number((consumed * rate).toFixed(2))

  let validation_status: BulkRow['validation_status'] = 'Valid'
  let validation_error = ''

  if (!row.tenant_user_id) {
    validation_status = 'Invalid'
    validation_error = 'No tenant on unit (no active lease).'
  } else if (!row.tenant_phone) {
    validation_status = 'Invalid'
    validation_error = 'Missing tenant phone number.'
  } else if (curr === null) {
    validation_status = 'Invalid'
    validation_error = 'Current reading required.'
  } else if (row.previous_reading !== null && curr < row.previous_reading) {
    validation_status = 'Invalid'
    validation_error = 'Current reading cannot be below previous reading.'
  } else if (!rate || rate <= 0) {
    validation_status = 'Invalid'
    validation_error = 'Price per unit must be > 0.'
  } else if (consumed <= 0) {
    validation_status = 'Invalid'
    validation_error = 'Units consumed must be > 0.'
  }

  return { ...row, units_consumed: consumed, amount, validation_status, validation_error }
}

function StatusBadge({ value }: { value: BulkRow['send_status'] }) {
  const variant =
    value === 'Sent' ? 'default' : value === 'Failed' ? 'destructive' : value === 'Skipped' ? 'secondary' : 'outline'
  return <Badge variant={variant as any}>{value}</Badge>
}

function renderEditableCell(params: ICellRendererParams<BulkRow>, placeholder: string) {
  const value = params.value
  if (value === null || value === undefined || value === '') {
    return <span className="bulk-cell-placeholder">{placeholder}</span>
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <span>{value}</span>
  }
  return <span>{String(value)}</span>
}

export default function BulkWaterBillingPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { user } = useAuth()
  const gridApiRef = useRef<GridApi | null>(null)
  const searchParams = useSearchParams()
  const autoLoadRef = useRef(false)
  const queryPropertyId = (searchParams.get('propertyId') || '').trim()
  const propertyScope =
    (user?.user_metadata as any)?.property_id ||
    (user?.user_metadata as any)?.building_id ||
    (user as any)?.property_id ||
    null

  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [propertyMeta, setPropertyMeta] = useState<Property | null>(null)

  const [loadingProps, setLoadingProps] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [globalRate, setGlobalRate] = useState<number>(85)
  const [notes, setNotes] = useState<string>('')

  const [rows, setRows] = useState<BulkRow[]>([])
  const [quickFilter, setQuickFilter] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    return nextWeek.toISOString().slice(0, 10)
  })
  const [autoLoadedPropertyId, setAutoLoadedPropertyId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ total: 0, processed: 0, succeeded: 0, failed: 0 })
  const [bulkComplete, setBulkComplete] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        setLoadingProps(true)
        setError(null)
        const res = await fetch('/api/water-bills/form-data', { cache: 'no-store' })
        const out = await res.json()
        if (!res.ok) throw new Error(out.error || 'Failed to load properties.')

        const props = (out.data?.properties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          location: p.location,
        }))
        const scoped = propertyScope ? props.filter((p: Property) => p.id === propertyScope) : props
        setProperties(scoped)
        if (propertyScope) {
          setSelectedPropertyId(propertyScope)
        }

        const defaultRate = out.data?.default_rate ? Number(out.data.default_rate) : 85
        if (Number.isFinite(defaultRate)) setGlobalRate(defaultRate)
      } catch (err: any) {
        setError(err?.message || 'Failed to load properties.')
      } finally {
        setLoadingProps(false)
      }
    })()
  }, [propertyScope])

  const colDefs: ColDef<BulkRow>[] = useMemo(
    () => [
      { headerName: 'Unit', field: 'unit_number', minWidth: 110, pinned: 'left' },
      { headerName: 'Tenant', field: 'tenant_name', minWidth: 170 },
      { headerName: 'Phone', field: 'tenant_phone', minWidth: 150 },
      {
        headerName: 'Prev',
        field: 'previous_reading',
        minWidth: 110,
        editable: true,
        valueParser: (p) => toNumberOrNull(p.newValue),
        cellClass: 'bulk-editable-cell',
        cellRenderer: (p: ICellRendererParams<BulkRow>) => renderEditableCell(p, 'Prev reading'),
      },
      {
        headerName: 'Curr',
        field: 'current_reading',
        minWidth: 110,
        editable: true,
        valueParser: (p) => toNumberOrNull(p.newValue),
        cellClass: 'bulk-editable-cell',
        cellRenderer: (p: ICellRendererParams<BulkRow>) => renderEditableCell(p, 'Enter reading'),
      },
      {
        headerName: 'Units',
        field: 'units_consumed',
        minWidth: 110,
        valueFormatter: (p) => (p.value ?? 0).toFixed(2),
      },
      {
        headerName: 'Rate',
        field: 'price_per_unit',
        minWidth: 120,
        editable: true,
        valueParser: (p) => Number(p.newValue || 0),
        cellClass: 'bulk-editable-cell',
        cellRenderer: (p: ICellRendererParams<BulkRow>) => renderEditableCell(p, 'Enter rate'),
      },
      {
        headerName: 'Amount',
        field: 'amount',
        minWidth: 130,
        valueFormatter: (p) => `KES ${(p.value ?? 0).toFixed(2)}`,
      },
      {
        headerName: 'Validation',
        field: 'validation_status',
        minWidth: 130,
        cellRenderer: (p: ICellRendererParams<BulkRow>) => (
          <Badge variant={p.data?.validation_status === 'Valid' ? 'default' : 'destructive'}>
            {p.data?.validation_status}
          </Badge>
        ),
      },
      { headerName: 'Validation Error', field: 'validation_error', minWidth: 220 },
      {
        headerName: 'Send Status',
        field: 'send_status',
        minWidth: 140,
        cellRenderer: (p: ICellRendererParams<BulkRow>) => <StatusBadge value={p.data?.send_status || 'Pending'} />,
      },
      { headerName: 'Message', field: 'send_message', minWidth: 220 },
    ],
    []
  )

  function applyGlobalRate(rate: number) {
    setRows((prev) => prev.map((row) => computeRow({ ...row, price_per_unit: rate })))
    gridApiRef.current?.refreshCells({ force: true })
  }

  function applyQuickFilter(value: string) {
    gridApiRef.current?.setQuickFilter?.(value)
    if (!gridApiRef.current?.setQuickFilter) {
      gridApiRef.current?.setGridOption('quickFilterText', value)
    }
  }

  const loadRows = useCallback(
    async (propertyId: string) => {
      try {
        setLoadingRows(true)
        setError(null)
      setRows([])
      setPropertyMeta(null)

      const res = await fetch(`/api/water-bills/bulk/form-data?propertyId=${propertyId}`, {
        cache: 'no-store',
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Failed to load tenants/units.')

      setPropertyMeta(out.data?.property || null)

      const defaultRate = out.data?.default_rate ? Number(out.data.default_rate) : globalRate
      if (Number.isFinite(defaultRate)) setGlobalRate(defaultRate)

      const mapped: BulkRow[] = (out.data?.rows || []).map((r: any) => {
        const base: BulkRow = {
          unit_id: r.unit_id,
          unit_number: r.unit_number,
          tenant_user_id: r.tenant_user_id,
          tenant_name: r.tenant_name,
          tenant_phone: r.tenant_phone,
          tenant_email: r.tenant_email,
          previous_reading: r.latest_reading ?? null,
          current_reading: null,
          price_per_unit: Number.isFinite(defaultRate) ? defaultRate : 85,
          units_consumed: 0,
          amount: 0,
          validation_status: 'Invalid',
          validation_error: 'Current reading required.',
          send_status: 'Pending',
        }
        return computeRow(base)
      })

      setRows(mapped)
      toast({ title: 'Loaded', description: `Loaded ${mapped.length} units for bulk billing.` })
    } catch (err: any) {
      setError(err?.message || 'Load failed.')
    } finally {
      setLoadingRows(false)
    }
    },
    [globalRate, toast]
  )

  useEffect(() => {
    if (loadingProps || autoLoadRef.current) return
    const target = queryPropertyId || propertyScope
    if (!target) return
    const exists = properties.some((property) => property.id === target)
    if (!exists) return
    autoLoadRef.current = true
    setSelectedPropertyId(target)
    setAutoLoadedPropertyId(target)
    loadRows(target)
  }, [loadingProps, properties, propertyScope, queryPropertyId, loadRows])

  async function sendBatches() {
    const valid = rows.filter((row) => row.validation_status === 'Valid' && row.send_status === 'Pending')
    if (!valid.length) {
      setError('No valid pending rows to send.')
      return
    }

    setBusy(true)
    setProgress({ total: valid.length, processed: 0, succeeded: 0, failed: 0 })

    try {
      const batches = chunk(valid, 10)
      let processed = 0
      let succeeded = 0
      let failed = 0

      const patchRow = (unitId: string, patch: Partial<BulkRow>) => {
        setRows((prev) =>
          prev.map((row) => (row.unit_id === unitId ? computeRow({ ...row, ...patch } as BulkRow) : row))
        )
      }

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi]
        const payloadItems = batch.map((row) => ({
          unitId: row.unit_id,
          unitNumber: row.unit_number,
          tenantUserId: row.tenant_user_id,
          tenantName: row.tenant_name,
          tenantPhone: row.tenant_phone,
          previousReading: row.previous_reading,
          currentReading: row.current_reading,
          pricePerUnit: row.price_per_unit,
          notes: notes || null,
        }))

        const res = await fetch('/api/water-bills/bulk/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: selectedPropertyId,
            propertyName: propertyMeta?.name || null,
            dueDate,
            notes: notes || null,
            items: payloadItems,
          }),
        })

        const out = await res.json()
        if (!res.ok) throw new Error(out.error || `Batch ${bi + 1} failed`)

        const results: Array<{ unitId: string; ok: boolean; invoiceId?: string; error?: string }> =
          out.data?.results || []

        for (const rr of results) {
          processed++
          if (rr.ok) {
            succeeded++
            patchRow(rr.unitId, {
              send_status: 'Sent',
              invoice_id: rr.invoiceId,
              send_message: `Sent. Invoice: ${rr.invoiceId}`,
            })
          } else {
            failed++
            patchRow(rr.unitId, { send_status: 'Failed', send_message: rr.error || 'Failed' })
          }

          setProgress({ total: valid.length, processed, succeeded, failed })
        }

        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      toast({ title: 'Bulk send complete', description: `Sent ${succeeded}, failed ${failed}.` })
      if (failed === 0 && succeeded > 0) {
        setBulkComplete(true)
      }
    } catch (err: any) {
      setError(err?.message || 'Bulk send failed.')
    } finally {
      setBusy(false)
    }
  }

  const autoLoadedProperty = useMemo(() => {
    if (!autoLoadedPropertyId) return null
    if (propertyMeta?.id === autoLoadedPropertyId) return propertyMeta
    return properties.find((property) => property.id === autoLoadedPropertyId) || null
  }, [autoLoadedPropertyId, propertyMeta, properties])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Bulk Water Billing</h1>
                <p className="text-sm text-muted-foreground">
                  Load a property, enter current readings, apply a global rate, and send invoices in batches of 10.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/dashboard/water-bills">Back to Water Bills</Link>
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {autoLoadedProperty && (
              <Alert>
                <AlertDescription>
                  Auto-loaded property: {autoLoadedProperty.name || 'Unnamed'}
                  {autoLoadedProperty.location ? ` - ${autoLoadedProperty.location}` : ''}.
                </AlertDescription>
              </Alert>
            )}

            {bulkComplete ? (
              <Card className="border-0 shadow-lg bg-white">
                <CardHeader className="bg-gradient-to-r from-[#1b4f72] via-[#2b6cb0] to-[#6ba4d9] text-white">
                  <CardTitle>Bulk billing complete</CardTitle>
                  <CardDescription className="text-white/90">
                    All invoices were sent successfully. You can start a new batch or review statements.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-8 space-y-4">
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <span>Property: {propertyMeta?.name || autoLoadedProperty?.name || 'Selected property'}</span>
                    <span>Total invoices sent: {progress.succeeded}</span>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={() => {
                        setBulkComplete(false)
                        router.push('/dashboard/water-bills/bulk')
                      }}
                    >
                      Create another bulk
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/water-bills/statements')}
                    >
                      Water bills statement
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>1) Select property</CardTitle>
                <CardDescription>Choose an apartment/property to bulk bill its occupied units.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:w-[420px] space-y-2">
                  <Label>Property</Label>
                  <Select
                    value={selectedPropertyId}
                    onValueChange={(value) => {
                      setSelectedPropertyId(value)
                      if (autoLoadedPropertyId && value !== autoLoadedPropertyId) {
                        setAutoLoadedPropertyId(null)
                      }
                    }}
                    disabled={loadingProps || busy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingProps ? 'Loading...' : 'Select a property'} />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name || 'Unnamed'} {property.location ? `- ${property.location}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => selectedPropertyId && loadRows(selectedPropertyId)}
                  disabled={!selectedPropertyId || loadingRows || busy}
                >
                  {loadingRows ? 'Loading...' : 'Load tenants'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>2) Configure rate and notes</CardTitle>
                <CardDescription>Set a global rate and apply a shared note to the batch.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Global price per unit (KES)</Label>
                  <Input
                    type="number"
                    value={globalRate}
                    onChange={(e) => {
                      const value = Number(e.target.value || 0)
                      setGlobalRate(value)
                      applyGlobalRate(value)
                    }}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notes (applies to all invoices)</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional note to include in SMS"
                    disabled={busy}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>3) Bulk billing grid</CardTitle>
                <CardDescription>
                  Enter current readings. Editing the Rate column in one row applies it globally.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    className="w-72"
                    placeholder="Quick filter"
                    value={quickFilter}
                    onChange={(e) => {
                      const value = e.target.value
                      setQuickFilter(value)
                      applyQuickFilter(value)
                    }}
                    disabled={!rows.length}
                  />

                  <div className="text-sm text-muted-foreground">
                    Rows: {rows.length} | Valid: {rows.filter((row) => row.validation_status === 'Valid').length} |
                    Pending: {rows.filter((row) => row.send_status === 'Pending').length}
                  </div>
                </div>

                <div className="ag-theme-quartz w-full h-[560px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
                  <AgGridReact<BulkRow>
                    theme="legacy"
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{
                      flex: 1,
                      minWidth: 120,
                      sortable: true,
                      resizable: true,
                      filter: true,
                    }}
                    headerHeight={44}
                    rowHeight={46}
                    pagination
                    paginationPageSize={25}
                    paginationPageSizeSelector={[10, 25, 50, 100]}
                    animateRows
                    onGridReady={(params) => {
                      gridApiRef.current = params.api
                      applyQuickFilter(quickFilter)
                    }}
                    onFirstDataRendered={() => {
                      gridApiRef.current?.sizeColumnsToFit()
                    }}
                    onCellValueChanged={(event) => {
                      if (!event.data) return

                      if (event.colDef.field === 'price_per_unit') {
                        const rate = Number(event.data.price_per_unit || 0)
                        setGlobalRate(rate)
                        applyGlobalRate(rate)
                        return
                      }

                      setRows((prev) =>
                        prev.map((row) => (row.unit_id === event.data!.unit_id ? computeRow({ ...event.data! }) : row))
                      )
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>4) Send invoices (batches of 10)</CardTitle>
                <CardDescription>
                  Sending runs sequentially to avoid timeouts. Each row will be marked Sent or Failed.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-3 w-full md:flex-row md:items-end md:w-auto">
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <Button onClick={sendBatches} disabled={busy || !rows.length}>
                    {busy ? 'Sending...' : 'Send bulk water invoices'}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  Total: {progress.total} | Processed: {progress.processed} | Succeeded: {progress.succeeded} | Failed:{' '}
                  {progress.failed}
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
