'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, GridApi } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

ModuleRegistry.registerModules([AllCommunityModule])

import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, Download } from 'lucide-react'

type ImportKind = 'invoice' | 'payment' | 'maintenance'

type ImportRow = {
  rowIndex: number
  kind: ImportKind

  // invoice/payment identity
  invoice_type?: 'rent' | 'water'
  period_start?: string // YYYY-MM-DD

  // invoice fields
  due_date?: string
  amount?: number
  paid?: 'YES' | 'NO'
  description?: string
  notes?: string

  // payment fields (NO partials)
  amount_paid?: number
  payment_date?: string // ISO or YYYY-MM-DD
  payment_method?: 'mpesa' | 'bank_transfer' | 'cash' | 'cheque'
  mpesa_receipt_number?: string
  bank_reference_number?: string
  verified?: boolean
  payment_notes?: string

  // maintenance fields
  request_date?: string // YYYY-MM-DD
  title?: string
  maintenance_description?: string
  priority_level?: 'low' | 'medium' | 'high' | 'urgent'
  maintenance_cost?: number
  maintenance_cost_paid_by?: 'tenant' | 'manager'
  maintenance_cost_notes?: string
  assigned_technician_name?: string
  assigned_technician_phone?: string

  validation_status: 'Valid' | 'Invalid'
  errors: string
  import_status: 'Pending' | 'Imported' | 'Failed' | 'Skipped'
  message?: string
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/

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
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return raw
}

function normalizeDateTimeCell(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return utc.toISOString()
  }
  const raw = String(value).trim()
  if (!raw) return ''
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return raw
}

function asStr(v: unknown) {
  return String(v ?? '').trim()
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : undefined
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function invoiceKey(type?: string, period?: string) {
  return `${type || ''}|${period || ''}`
}

export default function ImportPastDataPage() {
  const router = useRouter()
  const params = useParams()
  const tenantId = String((params as any)?.tenantId || '')

  const [tenantLabel, setTenantLabel] = useState<string>('Tenant')
  const [leaseLabel, setLeaseLabel] = useState<string>('')

  const [fileName, setFileName] = useState<string>('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loadingTenant, setLoadingTenant] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const gridApiRef = useRef<GridApi | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        setLoadingTenant(true)
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load tenant')

        if (!alive) return

        const name =
          json.data?.profile?.full_name ||
          json.data?.profile?.fullName ||
          json.data?.full_name ||
          'Tenant'
        const unit = json.data?.lease?.unit?.unit_number || ''
        const building = json.data?.lease?.unit?.building?.name || ''
        setTenantLabel(String(name))
        setLeaseLabel([building, unit ? `Unit ${unit}` : ''].filter(Boolean).join(' - '))
      } catch (e: any) {
        setError(e?.message || 'Failed to load tenant')
      } finally {
        setLoadingTenant(false)
      }
    }
    if (tenantId) load()
    return () => {
      alive = false
    }
  }, [tenantId])

  const validCount = useMemo(() => rows.filter((r) => r.validation_status === 'Valid').length, [rows])
  const invalidCount = useMemo(() => rows.filter((r) => r.validation_status === 'Invalid').length, [rows])

  const columnDefs = useMemo<ColDef[]>(
    () => [
      { headerName: '#', field: 'rowIndex', width: 70 },
      { headerName: 'Kind', field: 'kind', width: 130 },

      { headerName: 'invoice_type', field: 'invoice_type', width: 130 },
      { headerName: 'period_start', field: 'period_start', width: 140 },

      { headerName: 'due_date', field: 'due_date', width: 130 },
      { headerName: 'amount', field: 'amount', width: 110 },
      { headerName: 'paid', field: 'paid', width: 90 },

      { headerName: 'payment_date', field: 'payment_date', width: 200 },
      { headerName: 'amount_paid', field: 'amount_paid', width: 130 },
      { headerName: 'payment_method', field: 'payment_method', width: 160 },
      { headerName: 'mpesa_receipt', field: 'mpesa_receipt_number', width: 170 },

      { headerName: 'request_date', field: 'request_date', width: 140 },
      { headerName: 'maintenance_title', field: 'title', width: 180 },
      { headerName: 'priority', field: 'priority_level', width: 120 },
      { headerName: 'maintenance_cost', field: 'maintenance_cost', width: 150 },
      { headerName: 'paid_by', field: 'maintenance_cost_paid_by', width: 120 },

      { headerName: 'Valid', field: 'validation_status', width: 110 },
      { headerName: 'Errors', field: 'errors', flex: 1, minWidth: 260 },
      { headerName: 'Import', field: 'import_status', width: 120 },
      { headerName: 'Message', field: 'message', flex: 1, minWidth: 220 },
    ],
    []
  )

  // Excel template with 3 sheets + REQUIRED markers
  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()

    const invoices = wb.addWorksheet('Invoices')
    invoices.columns = [
      { header: 'invoice_type (rent|water) [REQUIRED]', key: 'invoice_type', width: 32 },
      { header: 'period_start (YYYY-MM-DD) [REQUIRED]', key: 'period_start', width: 30 },
      { header: 'due_date (YYYY-MM-DD) [REQUIRED]', key: 'due_date', width: 28 },
      { header: 'amount [REQUIRED]', key: 'amount', width: 16 },
      { header: 'paid (YES/NO) [REQUIRED]', key: 'paid', width: 22 },
      { header: 'description (optional)', key: 'description', width: 28 },
      { header: 'notes (optional)', key: 'notes', width: 28 },
    ]
    invoices.addRow({
      invoice_type: 'rent',
      period_start: '2024-01-01',
      due_date: '2024-01-05',
      amount: 35000,
      paid: 'YES',
      description: 'Rent Jan 2024',
      notes: '',
    })
    invoices.addRow({
      invoice_type: 'water',
      period_start: '2024-01-01',
      due_date: '2024-01-05',
      amount: 1200,
      paid: 'NO',
      description: 'Water Jan 2024',
      notes: '',
    })

    const payments = wb.addWorksheet('Payments')
    payments.columns = [
      { header: 'invoice_type (rent|water) [REQUIRED]', key: 'invoice_type', width: 32 },
      { header: 'period_start (YYYY-MM-DD) [REQUIRED]', key: 'period_start', width: 30 },
      { header: 'amount_paid [REQUIRED] (must equal invoice amount)', key: 'amount_paid', width: 44 },
      { header: 'payment_date (YYYY-MM-DD or ISO) [REQUIRED]', key: 'payment_date', width: 34 },
      { header: 'payment_method (mpesa|bank_transfer|cash|cheque) [REQUIRED]', key: 'payment_method', width: 48 },
      { header: 'mpesa_receipt_number (optional)', key: 'mpesa_receipt_number', width: 28 },
      { header: 'bank_reference_number (optional)', key: 'bank_reference_number', width: 30 },
      { header: 'verified (TRUE/FALSE, optional; default TRUE)', key: 'verified', width: 40 },
      { header: 'notes (optional)', key: 'notes', width: 28 },
    ]
    payments.addRow({
      invoice_type: 'rent',
      period_start: '2024-01-01',
      amount_paid: 35000,
      payment_date: '2024-01-05',
      payment_method: 'mpesa',
      mpesa_receipt_number: 'QWE123ABC9',
      bank_reference_number: '',
      verified: true,
      notes: 'Imported historical payment',
    })

    const maint = wb.addWorksheet('MaintenanceRequests')
    maint.columns = [
      { header: 'request_date (YYYY-MM-DD) [REQUIRED]', key: 'request_date', width: 30 },
      { header: 'title [REQUIRED]', key: 'title', width: 26 },
      { header: 'description [REQUIRED]', key: 'description', width: 34 },
      { header: 'priority_level (low|medium|high|urgent) [REQUIRED]', key: 'priority_level', width: 46 },
      { header: 'maintenance_cost [REQUIRED] (>= 0)', key: 'maintenance_cost', width: 30 },
      { header: 'maintenance_cost_paid_by (tenant|manager) [REQUIRED]', key: 'maintenance_cost_paid_by', width: 46 },
      { header: 'maintenance_cost_notes (optional)', key: 'maintenance_cost_notes', width: 30 },
      { header: 'assigned_technician_name (optional)', key: 'assigned_technician_name', width: 30 },
      { header: 'assigned_technician_phone (optional)', key: 'assigned_technician_phone', width: 30 },
    ]
    maint.addRow({
      request_date: '2024-01-10',
      title: 'Leaking tap',
      description: 'Kitchen tap leaking; replaced washer',
      priority_level: 'medium',
      maintenance_cost: 1500,
      maintenance_cost_paid_by: 'manager',
      maintenance_cost_notes: 'Plumber visit',
      assigned_technician_name: 'John Doe',
      assigned_technician_phone: '+2547XXXXXXXX',
    })

    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), `tenant-past-data-template.xlsx`)
  }

  const validateSingleRow = (r: ImportRow) => {
    const errs: string[] = []

    if (!r.kind) errs.push('kind missing')

    if (r.kind === 'invoice') {
      if (!r.invoice_type || !['rent', 'water'].includes(r.invoice_type)) errs.push('invoice_type must be rent|water')
      if (!r.period_start || !isoDateRe.test(r.period_start)) errs.push('period_start must be YYYY-MM-DD')
      if (!r.due_date || !isoDateRe.test(r.due_date)) errs.push('due_date must be YYYY-MM-DD')
      if (typeof r.amount !== 'number' || r.amount <= 0) errs.push('amount must be > 0')
      if (!r.paid || !['YES', 'NO'].includes(r.paid)) errs.push('paid must be YES or NO')
    }

    if (r.kind === 'payment') {
      if (!r.invoice_type || !['rent', 'water'].includes(r.invoice_type)) errs.push('invoice_type must be rent|water')
      if (!r.period_start || !isoDateRe.test(r.period_start)) errs.push('period_start must be YYYY-MM-DD')
      if (typeof r.amount_paid !== 'number' || r.amount_paid <= 0) errs.push('amount_paid must be > 0')
      if (!r.payment_date) errs.push('payment_date required')
      if (!r.payment_method || !['mpesa', 'bank_transfer', 'cash', 'cheque'].includes(r.payment_method)) {
        errs.push('payment_method invalid')
      }
    }

    if (r.kind === 'maintenance') {
      if (!r.request_date || !isoDateRe.test(r.request_date)) errs.push('request_date must be YYYY-MM-DD')
      if (!r.title) errs.push('title required')
      if (!r.maintenance_description) errs.push('description required')
      if (!r.priority_level || !['low', 'medium', 'high', 'urgent'].includes(r.priority_level)) {
        errs.push('priority_level invalid')
      }
      if (typeof r.maintenance_cost !== 'number' || r.maintenance_cost < 0) errs.push('maintenance_cost must be >= 0')
      if (!r.maintenance_cost_paid_by || !['tenant', 'manager'].includes(r.maintenance_cost_paid_by)) {
        errs.push('maintenance_cost_paid_by must be tenant|manager')
      }
    }

    return errs
  }

  // Cross-sheet validation: NO partial payments
  const validateNoPartialsAcrossSheets = (all: ImportRow[]) => {
    const invoiceMap = new Map<string, ImportRow>()
    const paymentsByKey = new Map<string, ImportRow[]>()

    for (const r of all) {
      if (r.kind === 'invoice') {
        invoiceMap.set(invoiceKey(r.invoice_type, r.period_start), r)
      }
      if (r.kind === 'payment') {
        const k = invoiceKey(r.invoice_type, r.period_start)
        paymentsByKey.set(k, [...(paymentsByKey.get(k) || []), r])
      }
    }

    const markInvalid = (r: ImportRow, msg: string) => {
      r.validation_status = 'Invalid'
      r.errors = r.errors ? `${r.errors}; ${msg}` : msg
    }

    for (const [k, inv] of invoiceMap.entries()) {
      const payRows = paymentsByKey.get(k) || []
      if (inv.paid === 'YES') {
        if (payRows.length !== 1) {
          markInvalid(inv, 'paid=YES requires exactly 1 payment row')
          for (const p of payRows) markInvalid(p, 'invoice requires exactly 1 payment row')
          continue
        }
        const p = payRows[0]
        if (typeof inv.amount === 'number' && typeof p.amount_paid === 'number') {
          if (Number(p.amount_paid) !== Number(inv.amount)) {
            markInvalid(inv, 'payment amount must equal invoice amount (no partials)')
            markInvalid(p, 'amount_paid must equal invoice amount (no partials)')
          }
        }
      } else if (inv.paid === 'NO') {
        if (payRows.length > 0) {
          markInvalid(inv, 'paid=NO requires 0 payments')
          for (const p of payRows) markInvalid(p, 'invoice is unpaid; payment row not allowed')
        }
      }
    }

    // Any payment without matching invoice is invalid (for safety)
    for (const [k, payRows] of paymentsByKey.entries()) {
      if (!invoiceMap.has(k)) {
        for (const p of payRows) markInvalid(p, 'payment references invoice that is not present in Invoices sheet')
      }
    }
  }

  const parseFile = async (file: File) => {
    setError(null)
    setSuccess(null)
    setParsing(true)
    setFileName(file.name)

    try {
      const buf = await file.arrayBuffer()
      const workbook = XLSX.read(buf, { type: 'array' })

      const readSheet = (name: string) => {
        const ws = workbook.Sheets[name]
        if (!ws) return []
        return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
      }

      const invRaw = readSheet('Invoices')
      const payRaw = readSheet('Payments')
      const maintRaw = readSheet('MaintenanceRequests')

      const out: ImportRow[] = []

      // Invoices
      for (let i = 0; i < invRaw.length; i++) {
        const row = invRaw[i]
        const mapped: ImportRow = {
          rowIndex: out.length + 1,
          kind: 'invoice',
          invoice_type: asStr(row['invoice_type (rent|water) [REQUIRED]'] ?? row['invoice_type']).toLowerCase() as any,
          period_start: normalizeDateCell(row['period_start (YYYY-MM-DD) [REQUIRED]'] ?? row['period_start']),
          due_date: normalizeDateCell(row['due_date (YYYY-MM-DD) [REQUIRED]'] ?? row['due_date']),
          amount: asNumber(row['amount [REQUIRED]'] ?? row['amount']),
          paid: asStr(row['paid (YES/NO) [REQUIRED]'] ?? row['paid']).toUpperCase() as any,
          description: asStr(row['description (optional)'] ?? row['description']),
          notes: asStr(row['notes (optional)'] ?? row['notes']),
          validation_status: 'Valid',
          errors: '',
          import_status: 'Pending',
        }
        if (!mapped.description) delete mapped.description
        if (!mapped.notes) delete mapped.notes

        const errs = validateSingleRow(mapped)
        mapped.validation_status = errs.length ? 'Invalid' : 'Valid'
        mapped.errors = errs.join('; ')
        out.push(mapped)
      }

      // Payments
      for (let i = 0; i < payRaw.length; i++) {
        const row = payRaw[i]
        const mapped: ImportRow = {
          rowIndex: out.length + 1,
          kind: 'payment',
          invoice_type: asStr(row['invoice_type (rent|water) [REQUIRED]'] ?? row['invoice_type']).toLowerCase() as any,
          period_start: normalizeDateCell(row['period_start (YYYY-MM-DD) [REQUIRED]'] ?? row['period_start']),
          amount_paid: asNumber(row['amount_paid [REQUIRED] (must equal invoice amount)'] ?? row['amount_paid']),
          payment_date: normalizeDateTimeCell(row['payment_date (YYYY-MM-DD or ISO) [REQUIRED]'] ?? row['payment_date']),
          payment_method: asStr(row['payment_method (mpesa|bank_transfer|cash|cheque) [REQUIRED]'] ?? row['payment_method']).toLowerCase() as any,
          mpesa_receipt_number: asStr(row['mpesa_receipt_number (optional)'] ?? row['mpesa_receipt_number']),
          bank_reference_number: asStr(row['bank_reference_number (optional)'] ?? row['bank_reference_number']),
          verified:
            String(row['verified (TRUE/FALSE, optional; default TRUE)'] ?? row['verified']).toLowerCase() === 'false'
              ? false
              : true,
          payment_notes: asStr(row['notes (optional)'] ?? row['notes']),
          validation_status: 'Valid',
          errors: '',
          import_status: 'Pending',
        }
        if (!mapped.mpesa_receipt_number) delete mapped.mpesa_receipt_number
        if (!mapped.bank_reference_number) delete mapped.bank_reference_number
        if (!mapped.payment_notes) delete mapped.payment_notes

        const errs = validateSingleRow(mapped)
        mapped.validation_status = errs.length ? 'Invalid' : 'Valid'
        mapped.errors = errs.join('; ')
        out.push(mapped)
      }

      // MaintenanceRequests
      for (let i = 0; i < maintRaw.length; i++) {
        const row = maintRaw[i]
        const mapped: ImportRow = {
          rowIndex: out.length + 1,
          kind: 'maintenance',
          request_date: normalizeDateCell(row['request_date (YYYY-MM-DD) [REQUIRED]'] ?? row['request_date']),
          title: asStr(row['title [REQUIRED]'] ?? row['title']),
          maintenance_description: asStr(row['description [REQUIRED]'] ?? row['description']),
          priority_level: asStr(row['priority_level (low|medium|high|urgent) [REQUIRED]'] ?? row['priority_level']).toLowerCase() as any,
          maintenance_cost: asNumber(row['maintenance_cost [REQUIRED] (>= 0)'] ?? row['maintenance_cost']),
          maintenance_cost_paid_by: asStr(row['maintenance_cost_paid_by (tenant|manager) [REQUIRED]'] ?? row['maintenance_cost_paid_by']).toLowerCase() as any,
          maintenance_cost_notes: asStr(row['maintenance_cost_notes (optional)'] ?? row['maintenance_cost_notes']),
          assigned_technician_name: asStr(row['assigned_technician_name (optional)'] ?? row['assigned_technician_name']),
          assigned_technician_phone: asStr(row['assigned_technician_phone (optional)'] ?? row['assigned_technician_phone']),
          validation_status: 'Valid',
          errors: '',
          import_status: 'Pending',
        }
        if (!mapped.maintenance_cost_notes) delete mapped.maintenance_cost_notes
        if (!mapped.assigned_technician_name) delete mapped.assigned_technician_name
        if (!mapped.assigned_technician_phone) delete mapped.assigned_technician_phone

        const errs = validateSingleRow(mapped)
        mapped.validation_status = errs.length ? 'Invalid' : 'Valid'
        mapped.errors = errs.join('; ')
        out.push(mapped)
      }

      // Cross-sheet enforcement: NO partial payments
      validateNoPartialsAcrossSheets(out)

      setRows(out)
      if (out.length === 0) setError('No rows found. Ensure sheet names: Invoices, Payments, MaintenanceRequests.')
    } catch (e: any) {
      setError(e?.message || 'Failed to parse file.')
    } finally {
      setParsing(false)
    }
  }

  const runImport = async () => {
    setError(null)
    setSuccess(null)

    const valid = rows.filter((r) => r.validation_status === 'Valid')
    if (valid.length === 0) {
      setError('No valid rows to import.')
      return
    }

    setImporting(true)
    try {
      const batches = chunk(valid, 50)

      let imported = 0
      let skipped = 0
      let failed = 0

      for (const b of batches) {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/import-past-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ file_name: fileName, rows: b }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Import failed.')

        const results: Array<{ rowIndex: number; status: 'inserted' | 'skipped' | 'failed'; message?: string }> =
          json.results || []

        setRows((prev) =>
          prev.map((r) => {
            const match = results.find((x) => x.rowIndex === r.rowIndex)
            if (!match) return r
            const newRow = { ...r }
            if (match.status === 'inserted') {
              newRow.import_status = 'Imported'
              newRow.message = match.message || 'Imported'
              imported++
            } else if (match.status === 'skipped') {
              newRow.import_status = 'Skipped'
              newRow.message = match.message || 'Skipped (duplicate)'
              skipped++
            } else {
              newRow.import_status = 'Failed'
              newRow.message = match.message || 'Failed'
              failed++
            }
            return newRow
          })
        )
      }

      setSuccess(`Import completed. Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`)
    } catch (e: any) {
      setError(e?.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.back()} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Import Past Data</h1>
                <p className="text-sm text-muted-foreground">
                  {loadingTenant ? 'Loading tenant...' : `${tenantLabel}${leaseLabel ? ` - ${leaseLabel}` : ''}`}
                </p>
              </div>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {success ? (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>1) Download template</CardTitle>
                <CardDescription>
                  This template enforces <b>NO partial payments</b>. Use exact sheet names:
                  <b> Invoices</b>, <b>Payments</b>, <b>MaintenanceRequests</b>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 items-center">
                <Button onClick={downloadTemplate} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download template
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2) Upload file</CardTitle>
                <CardDescription>
                  Upload the completed Excel file. The system will validate before importing.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={parsing || importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) parseFile(f)
                  }}
                />
                <div className="flex items-center gap-3">
                  <Badge variant="outline">Valid: {validCount}</Badge>
                  <Badge variant={invalidCount > 0 ? 'destructive' : 'outline'}>Invalid: {invalidCount}</Badge>
                  {parsing ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Parsing...
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3) Preview & import</CardTitle>
                <CardDescription>
                  Only valid rows will be imported. Duplicate rows are skipped automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="ag-theme-quartz" style={{ width: '100%', height: 520 }}>
                  <AgGridReact
                    rowData={rows}
                    columnDefs={columnDefs}
                    onGridReady={(p) => (gridApiRef.current = p.api)}
                    defaultColDef={{ sortable: true, filter: true, resizable: true }}
                    animateRows
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button onClick={runImport} disabled={importing || parsing || validCount === 0} className="gap-2">
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Import valid rows
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
