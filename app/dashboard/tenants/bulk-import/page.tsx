'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

ModuleRegistry.registerModules([AllCommunityModule])

import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SuccessStateCard } from '@/components/ui/success-state-card'
import { exportRowsAsCSV, exportRowsAsExcel, ExportColumn } from '@/lib/export/download'
import { ArrowLeft } from 'lucide-react'

type Property = { id: string; name: string; location?: string | null; total_units?: number | null }
type Unit = { id: string; unit_number: string; status: string; unit_price_category?: string | null }

type ImportRow = {
  rowIndex: number
  unit_number: string
  unit_id?: string
  full_name: string
  email: string
  phone_number: string
  national_id: string
  start_date?: string
  address?: string
  date_of_birth?: string

  validation_status: 'Valid' | 'Invalid'
  errors: string
  import_status: 'Pending' | 'Imported' | 'Failed' | 'Skipped'
  message?: string
}

function OverflowCell(props: ICellRendererParams) {
  const value = props.value == null ? '' : String(props.value)
  const spanRef = useRef<HTMLSpanElement | null>(null)
  const [showBubble, setShowBubble] = useState(false)

  useEffect(() => {
    const node = spanRef.current
    if (!node) return
    const measure = () => {
      setShowBubble(node.scrollWidth > node.clientWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [value])

  return (
    <div className="relative group w-full">
      <span ref={spanRef} className="block truncate">
        {value}
      </span>
      {showBubble && value && (
        <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 max-w-[320px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-lg opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0">
          {value}
        </div>
      )}
    </div>
  )
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRe = /^\+254\d{9}$/
const natIdRe = /^\d{8}$/
const isoDateRe = /^\d{4}-\d{2}-\d{2}$/

const todayIso = () => new Date().toISOString().slice(0, 10)

function normalizeHeader(h: unknown) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function asStr(v: unknown) {
  return String(v ?? '').trim()
}

function excelSerialToIso(serial: number) {
  const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
  return utc.toISOString().slice(0, 10)
}

function normalizeDateCell(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToIso(value)

  const raw = String(value).trim()
  if (!raw) return ''

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return raw
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function BulkImportTenantsPage() {
  const router = useRouter()
  const gridApiRef = useRef<GridApi | null>(null)

  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState<string>('')

  const [vacantOnly, setVacantOnly] = useState(true)
  const [units, setUnits] = useState<Unit[]>([])

  const [fileName, setFileName] = useState<string>('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [quickFilter, setQuickFilter] = useState('')

  const [chunkSize, setChunkSize] = useState<number>(10)

  const [loadingProps, setLoadingProps] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<{
    title: string
    description?: string
    badge?: string
    details?: { label: string; value: string }[]
  } | null>(null)

  const [progress, setProgress] = useState<{
    total: number
    processed: number
    succeeded: number
    failed: number
  }>({ total: 0, processed: 0, succeeded: 0, failed: 0 })

  const unitMap = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const u of units) m.set(u.unit_number, u)
    return m
  }, [units])

  const availableUnitNumbers = useMemo(() => {
    const list = vacantOnly ? units.filter((u) => u.status === 'vacant') : units
    return list.map((u) => u.unit_number)
  }, [units, vacantOnly])

  const validRows = useMemo(() => rows.filter((r) => r.validation_status === 'Valid'), [rows])

  const colDefs = useMemo<ColDef<ImportRow>[]>(() => {
    return [
      { headerName: '#', field: 'rowIndex', width: 70 },
      { headerName: 'Unit', field: 'unit_number', width: 120, filter: true },
      { headerName: 'Full name', field: 'full_name', minWidth: 180, flex: 1, filter: true },
      { headerName: 'Email', field: 'email', minWidth: 220, flex: 1, filter: true },
      { headerName: 'Phone', field: 'phone_number', width: 160, filter: true },
      { headerName: 'National ID', field: 'national_id', width: 140, filter: true },
      { headerName: 'Start date', field: 'start_date', width: 130, filter: true },
      { headerName: 'DOB', field: 'date_of_birth', width: 130, filter: true },
      { headerName: 'Address', field: 'address', minWidth: 160, flex: 1, filter: true },
      {
        headerName: 'Valid',
        field: 'validation_status',
        width: 110,
        cellRenderer: (p: any) =>
          p.value === 'Valid' ? <Badge>Valid</Badge> : <Badge variant="destructive">Invalid</Badge>,
        filter: true,
      },
      {
        headerName: 'Import',
        field: 'import_status',
        width: 120,
        cellRenderer: (p: any) => {
          const v = p.value
          if (v === 'Imported') return <Badge>Imported</Badge>
          if (v === 'Failed') return <Badge variant="destructive">Failed</Badge>
          if (v === 'Skipped') return <Badge variant="secondary">Skipped</Badge>
          return <Badge variant="outline">Pending</Badge>
        },
        filter: true,
      },
      { headerName: 'Message', field: 'message', minWidth: 220, flex: 1, filter: true },
      { headerName: 'Errors', field: 'errors', minWidth: 260, flex: 1, filter: true },
    ]
  }, [])

  async function loadProperties() {
    setLoadingProps(true)
    setError(null)
    try {
      const res = await fetch('/api/tenants/properties/list', { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load properties.')
      setProperties(payload.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load properties.')
    } finally {
      setLoadingProps(false)
    }
  }

  async function loadUnits(buildingId: string) {
    if (!buildingId) return
    setLoadingUnits(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/properties/${buildingId}/units?buildingId=${encodeURIComponent(buildingId)}`,
        { cache: 'no-store' }
      )
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load units.')
      const list: Unit[] = (payload.data?.units || []).map((u: any) => ({
        id: u.id,
        unit_number: u.unit_number,
        status: u.status,
        unit_price_category: u.unit_price_category ?? null,
      }))
      setUnits(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load units.')
    } finally {
      setLoadingUnits(false)
    }
  }

  useEffect(() => {
    loadProperties()
  }, [])

  useEffect(() => {
    if (propertyId) loadUnits(propertyId)
    setRows([])
    setFileName('')
    setProgress({ total: 0, processed: 0, succeeded: 0, failed: 0 })
  }, [propertyId])

  function validateRow(raw: any, idx: number): ImportRow {
    const unit_number = asStr(raw.unit_number)
    const full_name = asStr(raw.full_name)
    const email = asStr(raw.email).toLowerCase()
    const phone_number = asStr(raw.phone_number)
    const national_id = asStr(raw.national_id)

    const start_date = normalizeDateCell(raw.start_date) || todayIso()
    const address = asStr(raw.address) || ''
    const date_of_birth = normalizeDateCell(raw.date_of_birth) || ''

    const errors: string[] = []

    if (!unit_number) errors.push('unit_number is required')
    if (!full_name) errors.push('full_name is required')
    if (!email || !emailRe.test(email)) errors.push('invalid email')
    if (!phone_number || !phoneRe.test(phone_number)) errors.push('phone must be +254XXXXXXXXX')
    if (!national_id || !natIdRe.test(national_id)) errors.push('national_id must be 8 digits')

    if (start_date && !isoDateRe.test(start_date)) errors.push('start_date must be YYYY-MM-DD')
    if (date_of_birth && !isoDateRe.test(date_of_birth)) errors.push('date_of_birth must be YYYY-MM-DD')

    let unit_id: string | undefined
    if (unit_number) {
      const u = unitMap.get(unit_number)
      if (!u) {
        errors.push(`unit_number not found in selected property: ${unit_number}`)
      } else {
        unit_id = u.id
        if (vacantOnly && u.status !== 'vacant') errors.push(`unit is not vacant (${u.status})`)
      }
    }

    const valid = errors.length === 0

    return {
      rowIndex: idx + 1,
      unit_number,
      unit_id,
      full_name,
      email,
      phone_number,
      national_id,
      start_date,
      address: address || undefined,
      date_of_birth: date_of_birth || undefined,
      validation_status: valid ? 'Valid' : 'Invalid',
      errors: errors.join('; '),
      import_status: 'Pending',
      message: '',
    }
  }

  async function handleDownloadExcel() {
    if (!propertyId) {
      setError('Select a property first.')
      return
    }

    setError(null)

    const property = properties.find((p) => p.id === propertyId)
    const unitNumbers = availableUnitNumbers

    const wb = new ExcelJS.Workbook()

    const ws = wb.addWorksheet('TenantsImport')
    ws.columns = [
      { header: 'unit_number', key: 'unit_number', width: 18 },
      { header: 'full_name', key: 'full_name', width: 26 },
      { header: 'email', key: 'email', width: 28 },
      { header: 'phone_number', key: 'phone_number', width: 18 },
      { header: 'national_id', key: 'national_id', width: 14 },
      { header: 'start_date (YYYY-MM-DD)', key: 'start_date', width: 20 },
      { header: 'address', key: 'address', width: 26 },
      { header: 'date_of_birth (YYYY-MM-DD)', key: 'date_of_birth', width: 24 },
    ]

    ws.addRow({
      unit_number: '',
      full_name: 'Example Tenant',
      email: 'tenant@example.com',
      phone_number: '+254712345678',
      national_id: '12345678',
      start_date: todayIso(),
      address: 'Nairobi',
      date_of_birth: '1995-01-01',
    })

    for (const u of unitNumbers) {
      ws.addRow({
        unit_number: u,
        full_name: '',
        email: '',
        phone_number: '',
        national_id: '',
        start_date: todayIso(),
        address: '',
        date_of_birth: '',
      })
    }

    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const ref = wb.addWorksheet('UnitsReference')
    ref.columns = [
      { header: 'unit_number', key: 'unit_number', width: 18 },
      { header: 'status', key: 'status', width: 14 },
    ]
    ref.getRow(1).font = { bold: true }
    ref.views = [{ state: 'frozen', ySplit: 1 }]

    const refUnits = vacantOnly ? units.filter((x) => x.status === 'vacant') : units
    for (const u of refUnits) ref.addRow({ unit_number: u.unit_number, status: u.status })

    const lastRefRow = Math.max(2, ref.rowCount)
    const formula = `UnitsReference!$A$2:$A$${lastRefRow}`

    for (let r = 2; r <= Math.min(500, ws.rowCount + 50); r++) {
      ws.getCell(`A${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const safeName = (property?.name || 'property').replace(/[^a-z0-9]+/gi, '_')
    saveAs(blob, `tenants_import_${safeName}_${todayIso()}.xlsx`)
  }

  async function handleDownloadCSV() {
    if (!propertyId) {
      setError('Select a property first.')
      return
    }
    setError(null)

    const property = properties.find((p) => p.id === propertyId)
    const unitNumbers = availableUnitNumbers

    const headers = [
      'unit_number',
      'full_name',
      'email',
      'phone_number',
      'national_id',
      'start_date',
      'address',
      'date_of_birth',
    ]

    const lines: string[] = []
    lines.push(headers.join(','))

    lines.push(
      [
        '',
        'Example Tenant',
        'tenant@example.com',
        '+254712345678',
        '12345678',
        todayIso(),
        'Nairobi',
        '1995-01-01',
      ]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(',')
    )

    for (const u of unitNumbers) {
      lines.push(
        [u, '', '', '', '', todayIso(), '', '']
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(',')
      )
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const safeName = (property?.name || 'property').replace(/[^a-z0-9]+/gi, '_')
    saveAs(blob, `tenants_import_${safeName}_${todayIso()}.csv`)
  }

  async function handleUpload(file: File) {
    if (!propertyId) {
      setError('Select a property first.')
      return
    }

    setError(null)
    setSuccessState(null)
    setBusy(true)

    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })

      const firstSheetName = wb.SheetNames[0]
      const sheet = wb.Sheets[firstSheetName]
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      if (!json.length) {
        setRows([])
        setError('No rows found in file.')
        return
      }

      const normalized = json.map((row) => {
        const out: any = {}
        for (const k of Object.keys(row)) {
          const key = normalizeHeader(k)
          if (key.startsWith('start_date') || key === 'startdate') {
            out.start_date = row[k]
            continue
          }
          if (key.startsWith('date_of_birth') || key === 'dob' || key === 'dateofbirth') {
            out.date_of_birth = row[k]
            continue
          }
          out[key] = row[k]
        }
        return out
      })

      const built = normalized.map((r, idx) => validateRow(r, idx))
      setRows(built)

      setProgress({
        total: built.filter((x) => x.validation_status === 'Valid').length,
        processed: 0,
        succeeded: 0,
        failed: 0,
      })

      if (gridApiRef.current) gridApiRef.current.setGridOption('quickFilterText', quickFilter)
    } catch (e: any) {
      setError(e?.message || 'Failed to parse file.')
    } finally {
      setBusy(false)
    }
  }

  function exportPreview(format: 'csv' | 'excel') {
    const exportRows: ImportRow[] = []
    gridApiRef.current?.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) exportRows.push(node.data)
    })

    const cols: ExportColumn<ImportRow>[] = [
      { header: 'unit_number', accessor: (r) => r.unit_number },
      { header: 'full_name', accessor: (r) => r.full_name },
      { header: 'email', accessor: (r) => r.email },
      { header: 'phone_number', accessor: (r) => r.phone_number },
      { header: 'national_id', accessor: (r) => r.national_id },
      { header: 'start_date', accessor: (r) => r.start_date || '' },
      { header: 'address', accessor: (r) => r.address || '' },
      { header: 'date_of_birth', accessor: (r) => r.date_of_birth || '' },
      { header: 'validation_status', accessor: (r) => r.validation_status },
      { header: 'import_status', accessor: (r) => r.import_status },
      { header: 'message', accessor: (r) => r.message || '' },
      { header: 'errors', accessor: (r) => r.errors || '' },
    ]

    const base = `tenants_bulk_preview_${todayIso()}`
    if (format === 'excel') {
      void exportRowsAsExcel(base, cols, exportRows)
    } else {
      void exportRowsAsCSV(base, cols, exportRows)
    }
  }

  async function handleImport() {
    if (!propertyId) {
      setError('Select a property first.')
      return
    }

    setError(null)
    setSuccessState(null)

    const selected: ImportRow[] = []
    gridApiRef.current?.getSelectedNodes().forEach((n) => n.data && selected.push(n.data))

    const base = (selected.length ? selected : rows).filter(
      (r) => r.validation_status === 'Valid' && r.import_status === 'Pending'
    )

    if (!base.length) {
      setError('No valid pending rows to import.')
      return
    }

    const size = Math.max(10, Math.min(25, chunkSize))

    setBusy(true)
    setProgress({ total: base.length, processed: 0, succeeded: 0, failed: 0 })

    try {
      const batches = chunk(base, size)

      let processed = 0
      let succeeded = 0
      let failed = 0

      const updateRow = (rowIndex: number, patch: Partial<ImportRow>) => {
        setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)))
      }

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi]

        const payloadRows = batch.map((r) => ({
          unit_number: r.unit_number,
          unit_id: r.unit_id,
          full_name: r.full_name,
          email: r.email,
          phone_number: r.phone_number,
          national_id: r.national_id,
          start_date: r.start_date || todayIso(),
          address: r.address || '',
          date_of_birth: r.date_of_birth || '',
        }))

        const res = await fetch('/api/tenants/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId, rows: payloadRows }),
        })

        const out = await res.json()
        if (!res.ok) {
          throw new Error(out.error || `Batch ${bi + 1} failed`)
        }

        const results: Array<{ rowIndex: number; ok: boolean; error?: string; tenantEmail?: string }> =
          out.results || []

        for (let i = 0; i < results.length; i++) {
          const rr = results[i]
          const srcRow = batch[i]
          processed++

          if (rr.ok) {
            succeeded++
            updateRow(srcRow.rowIndex, {
              import_status: 'Imported',
              message: `Imported ${rr.tenantEmail || ''}`.trim(),
            })
          } else {
            failed++
            updateRow(srcRow.rowIndex, {
              import_status: 'Failed',
              message: rr.error || 'Failed',
            })
          }

          setProgress({ total: base.length, processed, succeeded, failed })
        }

        await sleep(250)
      }

      setSuccessState({
        title: 'Tenant import completed',
        description: failed > 0 ? 'Import completed with some failures.' : 'All rows imported successfully.',
        badge: failed > 0 ? 'Completed with warnings' : 'Import success',
        details: [
          { label: 'Processed', value: String(processed) },
          { label: 'Imported', value: String(succeeded) },
          { label: 'Failed', value: String(failed) },
        ],
      })
    } catch (e: any) {
      setError(e?.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Back to tenants"
                  onClick={() => router.push('/dashboard/tenants')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Bulk Import Tenants</h1>
                  <p className="text-sm text-muted-foreground">
                    Download a property template (with unit numbers), fill tenants, upload and import in safe batches.
                  </p>
                </div>
              </div>
            </div>

            {successState ? (
              <SuccessStateCard
                title={successState.title}
                description={successState.description}
                badge={successState.badge}
                details={successState.details}
                onBack={() => router.push('/dashboard/tenants')}
                actions={
                  <>
                    <Button onClick={() => setSuccessState(null)}>Import another file</Button>
                    <Button variant="outline" onClick={() => router.push('/dashboard/tenants')}>
                      Back to tenants
                    </Button>
                  </>
                }
              />
            ) : (
              <>
                {error && (
                  <Card className="border-0 shadow bg-white">
                    <CardContent className="p-4">
                      <p className="text-sm text-red-600">{error}</p>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>1) Select property</CardTitle>
                <CardDescription>Template unit numbers are generated from this property.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:max-w-md">
                  <Label>Property</Label>
                  <Select value={propertyId} onValueChange={setPropertyId} disabled={loadingProps}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingProps ? 'Loading…' : 'Select property'} />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={vacantOnly} onCheckedChange={setVacantOnly} />
                    <Label>Vacant units only</Label>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Units loaded: {loadingUnits ? 'Loading…' : units.length}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>2) Download template</CardTitle>
                <CardDescription>Excel recommended. Includes: start_date, address, date_of_birth.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button onClick={handleDownloadExcel} disabled={!propertyId || loadingUnits}>
                  Download Excel Template
                </Button>
                <Button variant="outline" onClick={handleDownloadCSV} disabled={!propertyId || loadingUnits}>
                  Download CSV Template
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>3) Upload completed file</CardTitle>
                <CardDescription>Upload .xlsx or .csv. Rows are validated before import.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <input
                    id="bulk-import-file"
                    type="file"
                    accept=".xlsx,.csv"
                    className="sr-only"
                    disabled={!propertyId || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) {
                        setFileName('')
                        return
                      }
                      setFileName(f.name)
                      handleUpload(f)
                    }}
                    onClick={(e) => {
                      ;(e.currentTarget as HTMLInputElement).value = ''
                    }}
                  />
                  <label
                    htmlFor="bulk-import-file"
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-sm transition
                      ${busy || !propertyId ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0'}
                      bg-white text-slate-800 border-slate-200 hover:border-slate-300`}
                  >
                    Choose file
                  </label>
                  <div className="text-sm text-muted-foreground truncate max-w-full md:max-w-[420px] sm:mt-0">
                    {fileName ? `Loaded: ${fileName}` : 'No file uploaded yet.'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>4) Preview (AG Grid)</CardTitle>
                <CardDescription>
                  Use quick filter, select rows (optional), then import in safe batches.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-72"
                      placeholder="Quick filter"
                      value={quickFilter}
                      onChange={(e) => {
                        const v = e.target.value
                        setQuickFilter(v)
                        gridApiRef.current?.setGridOption('quickFilterText', v)
                      }}
                    />
                    <Button variant="outline" onClick={() => exportPreview('csv')} disabled={!rows.length}>
                      Export preview CSV
                    </Button>
                    <Button variant="outline" onClick={() => exportPreview('excel')} disabled={!rows.length}>
                      Export preview Excel
                    </Button>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Rows: {rows.length} | Valid: {validRows.length}
                  </div>
                </div>

                <div className="ag-theme-quartz w-full h-[520px] rounded-lg border border-slate-200 bg-white overflow-auto">
                  <AgGridReact<ImportRow>
                    theme="legacy"
                    rowData={rows}
                    columnDefs={colDefs}
                    defaultColDef={{
                      flex: 1,
                      minWidth: 120,
                      sortable: true,
                      resizable: true,
                      filter: true,
                      floatingFilter: true,
                      cellRenderer: OverflowCell,
                      cellStyle: { overflow: 'visible' },
                    }}
                    rowSelection={{ mode: 'multiRow' }}
                    pagination
                    paginationPageSize={25}
                    paginationPageSizeSelector={[10, 25, 50, 100]}
                    animateRows
                    onGridReady={(p) => {
                      gridApiRef.current = p.api
                      p.api.setGridOption('quickFilterText', quickFilter)
                    }}
                    onFirstDataRendered={() => {
                      gridApiRef.current?.sizeColumnsToFit()
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow bg-white">
              <CardHeader>
                <CardTitle>5) Import</CardTitle>
                <CardDescription>
                  API supports 10–25 rows per request. Import runs sequentially to avoid rate limits/timeouts.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex items-end gap-4">
                  <div className="w-56">
                    <Label>Batch size</Label>
                    <Select value={String(chunkSize)} onValueChange={(v) => setChunkSize(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 15, 20, 25].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} rows/request
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleImport} disabled={busy || !rows.length}>
                    {busy ? 'Importing…' : 'Import tenants'}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  Total: {progress.total} | Processed: {progress.processed} | Succeeded: {progress.succeeded} | Failed:{' '}
                  {progress.failed}
                </div>
              </CardContent>
            </Card>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
