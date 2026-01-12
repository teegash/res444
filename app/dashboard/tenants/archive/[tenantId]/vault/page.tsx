'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF, ExportColumn } from '@/lib/export/download'

ModuleRegistry.registerModules([AllCommunityModule])

type VaultPayload = {
  tenant: {
    full_name?: string | null
    phone_number?: string | null
    national_id?: string | null
    email?: string | null
  }
  archive: {
    archived_at: string
    reason?: string | null
    notes?: string | null
    snapshot?: any
  }
  leases: any[]
  ledger: Array<{
    entry_date: string
    description: string
    debit: number
    credit: number
    entry_type: string
    status_text?: string | null
  }>
  maintenance: any[]
  maintenanceExpenses: any[]
  waterBills: any[]
  messages: any[]
  documents: any[]
}

type DeleteSummary = {
  tenant_id?: string
  organization_id?: string | null
  counts?: Record<string, number>
  storage?: Record<string, number>
  errors?: Array<{ step: string; message: string }>
}

function kes(value: unknown) {
  const amount = Number(value || 0)
  return amount.toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })
}

function safeDate(value?: string | null) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function renderStatusPill(value?: string | null) {
  const status = String(value || '').trim().toLowerCase()
  if (!status) return <span className="text-slate-400">—</span>

  const isPaid = ['paid', 'settled', 'cleared'].includes(status)
  const isUnpaid = ['unpaid', 'overdue', 'pending'].includes(status)
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize'
  const style = isPaid
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : isUnpaid
    ? 'border-rose-200 bg-rose-100 text-rose-700'
    : 'border-slate-200 bg-slate-100 text-slate-600'
  return <span className={`${base} ${style}`}>{status}</span>
}

export default function TenantVaultPage() {
  const router = useRouter()
  const params = useParams()
  const tenantId = String((params as any)?.tenantId || '')

  const [data, setData] = useState<VaultPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummary | null>(null)
  const [deleteSummaryOpen, setDeleteSummaryOpen] = useState(false)
  const [deleteSucceeded, setDeleteSucceeded] = useState(false)
  const [deletedTenantName, setDeletedTenantName] = useState<string | null>(null)
  const [deletedTenantEmail, setDeletedTenantEmail] = useState<string | null>(null)

  const ledgerGridRef = useRef<AgGridReact<any>>(null)
  const maintGridRef = useRef<AgGridReact<any>>(null)
  const leaseGridRef = useRef<AgGridReact<any>>(null)
  const waterGridRef = useRef<AgGridReact<any>>(null)
  const messageGridRef = useRef<AgGridReact<any>>(null)
  const docGridRef = useRef<AgGridReact<any>>(null)

  useEffect(() => {
    if (!tenantId) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/vault`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json.error || 'Failed to load vault.')
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load vault.')
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenantId])

  const ledgerRows = data?.ledger || []
  const maintenanceRows = useMemo(() => {
    const expMap = new Map<string, any[]>()
    for (const e of data?.maintenanceExpenses || []) {
      const key = e.maintenance_request_id
      if (!key) continue
      expMap.set(key, [...(expMap.get(key) || []), e])
    }
    return (data?.maintenance || []).map((m: any) => {
      const expenses = expMap.get(m.id) || []
      return {
        ...m,
        linked_expense_amount: expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        linked_expense_count: expenses.length,
      }
    })
  }, [data])

  const leaseRows = data?.leases || []
  const waterBillRows = data?.waterBills || []
  const documentRows = useMemo(
    () => (data?.documents || []).filter((doc: any) => doc?.category !== 'transition'),
    [data]
  )
  const messageRows = useMemo(
    () =>
      (data?.messages || []).map((msg: any) => ({
        ...msg,
        direction: msg.sender_user_id === tenantId ? 'Tenant' : 'Staff',
      })),
    [data, tenantId]
  )

  const ledgerCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Date', field: 'entry_date', minWidth: 120 },
      { headerName: 'Description', field: 'description', flex: 1, minWidth: 260 },
      {
        headerName: 'Debit',
        field: 'debit',
        minWidth: 140,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      {
        headerName: 'Credit',
        field: 'credit',
        minWidth: 140,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      { headerName: 'Status', field: 'status_text', minWidth: 120, cellRenderer: (p: any) => renderStatusPill(p.value) },
    ],
    []
  )

  const maintCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Created', field: 'created_at', minWidth: 160, valueFormatter: (p) => safeDate(p.value) },
      { headerName: 'Title', field: 'title', flex: 1, minWidth: 220 },
      { headerName: 'Status', field: 'status', minWidth: 120 },
      {
        headerName: 'Cost',
        field: 'maintenance_cost',
        minWidth: 120,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      { headerName: 'Paid By', field: 'maintenance_cost_paid_by', minWidth: 120 },
      {
        headerName: 'Linked Expense',
        field: 'linked_expense_amount',
        minWidth: 160,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      { headerName: '#Expenses', field: 'linked_expense_count', minWidth: 120 },
    ],
    []
  )

  const leaseCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Start', field: 'start_date', minWidth: 120 },
      { headerName: 'End', field: 'end_date', minWidth: 120 },
      { headerName: 'Status', field: 'status', minWidth: 120 },
      {
        headerName: 'Rent',
        field: 'monthly_rent',
        minWidth: 120,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      {
        headerName: 'Deposit',
        field: 'deposit_amount',
        minWidth: 120,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      { headerName: 'Unit', valueGetter: (p) => p.data?.unit?.unit_number || '-', minWidth: 120 },
      { headerName: 'Property', valueGetter: (p) => p.data?.unit?.building?.name || '-', minWidth: 180 },
    ],
    []
  )

  const waterCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Billing Month', field: 'billing_month', minWidth: 130 },
      { headerName: 'Property', field: 'property_name', minWidth: 180 },
      { headerName: 'Unit', field: 'unit_number', minWidth: 100 },
      {
        headerName: 'Amount',
        field: 'amount',
        minWidth: 120,
        valueFormatter: (p) => kes(p.value),
        cellClass: 'text-right',
      },
      { headerName: 'Units', field: 'units_consumed', minWidth: 90 },
      { headerName: 'Status', field: 'status', minWidth: 120, cellRenderer: (p: any) => renderStatusPill(p.value) },
      { headerName: 'Invoice Due', field: 'invoice_due_date', minWidth: 120 },
    ],
    []
  )

  const messageCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Date', field: 'created_at', minWidth: 160, valueFormatter: (p) => safeDate(p.value) },
      { headerName: 'From', field: 'direction', minWidth: 120 },
      { headerName: 'Type', field: 'message_type', minWidth: 120 },
      { headerName: 'Message', field: 'message_text', flex: 1, minWidth: 260 },
    ],
    []
  )

  const documentCols = useMemo<ColDef[]>(
    () => [
      { headerName: 'Type', field: 'category', minWidth: 140 },
      { headerName: 'Label', field: 'label', flex: 1, minWidth: 220 },
      { headerName: 'Date', field: 'created_at', minWidth: 140, valueFormatter: (p) => safeDate(p.value) },
      {
        headerName: 'Document',
        field: 'url',
        minWidth: 140,
        cellRenderer: (p: any) => {
          const url = p.value as string | null
          if (!url) return <span className="text-slate-400">—</span>
          return (
            <a href={url} target="_blank" rel="noreferrer" className="text-[#4169E1] hover:underline">
              View
            </a>
          )
        },
      },
    ],
    []
  )

  const exportLedgerColumns = useMemo<ExportColumn<any>[]>(
    () => [
      { header: 'Date', accessor: (r) => r.entry_date || '' },
      { header: 'Description', accessor: (r) => r.description || '' },
      { header: 'Debit', accessor: (r) => kes(r.debit), align: 'right' },
      { header: 'Credit', accessor: (r) => kes(r.credit), align: 'right' },
      { header: 'Status', accessor: (r) => r.status_text || '' },
    ],
    []
  )

  const exportMaintenanceColumns = useMemo<ExportColumn<any>[]>(
    () => [
      { header: 'Created', accessor: (r) => safeDate(r.created_at) },
      { header: 'Title', accessor: (r) => r.title || '' },
      { header: 'Status', accessor: (r) => r.status || '' },
      { header: 'Cost', accessor: (r) => kes(r.maintenance_cost), align: 'right' },
      { header: 'Paid By', accessor: (r) => r.maintenance_cost_paid_by || '' },
      { header: 'Linked Expense', accessor: (r) => kes(r.linked_expense_amount), align: 'right' },
    ],
    []
  )

  const exportLeasesColumns = useMemo<ExportColumn<any>[]>(
    () => [
      { header: 'Start', accessor: (r) => r.start_date || '' },
      { header: 'End', accessor: (r) => r.end_date || '' },
      { header: 'Status', accessor: (r) => r.status || '' },
      { header: 'Rent', accessor: (r) => kes(r.monthly_rent), align: 'right' },
      { header: 'Deposit', accessor: (r) => kes(r.deposit_amount), align: 'right' },
      { header: 'Unit', accessor: (r) => r.unit?.unit_number || '-' },
      { header: 'Property', accessor: (r) => r.unit?.building?.name || '-' },
    ],
    []
  )

  const tenantName = data?.tenant?.full_name || 'Tenant'
  const archivedAt = data?.archive?.archived_at
    ? new Date(data.archive.archived_at).toLocaleString()
    : '-'

  const snapshotUnit = data?.archive?.snapshot?.unit?.unit_number || null
  const snapshotProperty = data?.archive?.snapshot?.unit?.building?.name || null
  const waterUnpaid = useMemo(
    () => waterBillRows.filter((row: any) => String(row?.status || '').toLowerCase() !== 'paid'),
    [waterBillRows]
  )
  const waterUnpaidTotal = useMemo(
    () => waterUnpaid.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    [waterUnpaid]
  )
  const ledgerTotals = useMemo(() => {
    return ledgerRows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit || 0)
        acc.credit += Number(row.credit || 0)
        return acc
      },
      { debit: 0, credit: 0 }
    )
  }, [ledgerRows])

  const exportLetterhead = useMemo(
    () => ({
      tenantName,
      tenantPhone: data?.tenant?.phone_number || undefined,
      propertyName: snapshotProperty || undefined,
      unitNumber: snapshotUnit || undefined,
      documentTitle: `Tenant Vault - ${tenantName}`,
    }),
    [data, snapshotProperty, snapshotUnit, tenantName]
  )

  const exportTab = async (kind: 'ledger' | 'maintenance' | 'leases', format: 'pdf' | 'excel' | 'csv') => {
    if (!data || exporting) return
    setExporting(true)
    try {
      const now = new Date()
      const dateStamp = now.toISOString().slice(0, 10)
      const base = `tenant-vault-${tenantName.replace(/\s+/g, '-').toLowerCase()}-${kind}-${dateStamp}`

      if (kind === 'ledger') {
        if (format === 'pdf') {
          await exportRowsAsPDF(base, exportLedgerColumns, ledgerRows, {
            title: 'Tenant Vault - Statement',
            letterhead: exportLetterhead,
            orientation: 'landscape',
          })
        }
        if (format === 'excel') {
          await exportRowsAsExcel(base, exportLedgerColumns, ledgerRows, [], { letterhead: exportLetterhead })
        }
        if (format === 'csv') {
          await exportRowsAsCSV(base, exportLedgerColumns, ledgerRows, [], { letterhead: exportLetterhead })
        }
      }

      if (kind === 'maintenance') {
        if (format === 'pdf') {
          await exportRowsAsPDF(base, exportMaintenanceColumns, maintenanceRows, {
            title: 'Tenant Vault - Maintenance',
            letterhead: exportLetterhead,
            orientation: 'landscape',
          })
        }
        if (format === 'excel') {
          await exportRowsAsExcel(base, exportMaintenanceColumns, maintenanceRows, [], { letterhead: exportLetterhead })
        }
        if (format === 'csv') {
          await exportRowsAsCSV(base, exportMaintenanceColumns, maintenanceRows, [], { letterhead: exportLetterhead })
        }
      }

      if (kind === 'leases') {
        if (format === 'pdf') {
          await exportRowsAsPDF(base, exportLeasesColumns, leaseRows, {
            title: 'Tenant Vault - Leases',
            letterhead: exportLetterhead,
            orientation: 'landscape',
          })
        }
        if (format === 'excel') {
          await exportRowsAsExcel(base, exportLeasesColumns, leaseRows, [], { letterhead: exportLetterhead })
        }
        if (format === 'csv') {
          await exportRowsAsCSV(base, exportLeasesColumns, leaseRows, [], { letterhead: exportLetterhead })
        }
      }
    } finally {
      setExporting(false)
    }
  }

  const deleteRecordEntries = deleteSummary?.counts
    ? Object.entries(deleteSummary.counts).filter(([, value]) => value > 0)
    : []
  const deleteStorageEntries = deleteSummary?.storage
    ? Object.entries(deleteSummary.storage).filter(([, value]) => value > 0)
    : []

  const handleDeleteTenant = async () => {
    if (!tenantId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))

      if (payload?.summary) {
        setDeleteSummary(payload.summary)
        setDeleteSummaryOpen(true)
        setDeletedTenantName(tenantName)
        setDeletedTenantEmail(data?.tenant?.email || null)
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete tenant.')
      }

      setDeleteSucceeded(true)
      setDeleteOpen(false)
      setDeleteInput('')
    } catch (deleteErr) {
      setDeleteError(deleteErr instanceof Error ? deleteErr.message : 'Failed to delete tenant.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen bg-slate-100 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute top-20 -left-24 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl" />
      </div>
      <Sidebar />
      <div className="relative z-10 flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <Button variant="ghost" className="px-0" onClick={() => router.push('/dashboard/tenants/archive')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <Card className="border-0 bg-white/90 shadow-xl backdrop-blur">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <Shield className="h-4 w-4 text-slate-500" />
                      Tenant Vault
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-bold text-slate-900">{tenantName}</h1>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        <Sparkles className="h-3.5 w-3.5" /> Archived
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Archived: <span className="font-medium text-slate-900">{archivedAt}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <span>Email: {data?.tenant?.email || '—'}</span>
                      <span>Phone: {data?.tenant?.phone_number || '—'}</span>
                      <span>ID: {data?.tenant?.national_id || '—'}</span>
                    </div>
                    {snapshotProperty || snapshotUnit ? (
                      <div className="text-sm text-slate-600">
                        Last unit:{' '}
                        <span className="font-medium text-slate-900">
                          {snapshotUnit || '-'}{snapshotProperty ? ` • ${snapshotProperty}` : ''}
                        </span>
                      </div>
                    ) : null}
                    {data?.archive?.reason ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Reason: {data.archive.reason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="grid min-w-[240px] gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-lg">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Vault Summary</div>
                      <div className="text-sm">Ledger debit: {kes(ledgerTotals.debit)}</div>
                      <div className="text-sm">Ledger credit: {kes(ledgerTotals.credit)}</div>
                      <div className="text-sm">
                        Water bills unpaid: {waterUnpaid.length} • {kes(waterUnpaidTotal)}
                      </div>
                      <div className="text-sm">
                        Documents: {documentRows.length} • Messages: {messageRows.length}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      className="min-w-[200px]"
                      onClick={() => {
                        setDeleteError(null)
                        setDeleteOpen(true)
                      }}
                      disabled={loading || deleting}
                    >
                      Delete tenant
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
                  {data?.archive?.notes ? <span>Notes: {data.archive.notes}</span> : null}
                  {error ? <span className="text-rose-600">{error}</span> : null}
                  {loading ? <span>Loading vault...</span> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white/90 shadow-xl backdrop-blur">
              <CardContent className="p-4">
                <Tabs defaultValue="ledger">
                  <TabsList className="bg-slate-100/80 p-1 rounded-full">
                    <TabsTrigger value="ledger">Statement</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                    <TabsTrigger value="water">Water Bills</TabsTrigger>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="leases">Leases</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ledger" className="mt-4">
                    <div className="flex gap-2 flex-wrap mb-3">
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('ledger', 'pdf')}>
                        PDF
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('ledger', 'excel')}>
                        Excel
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('ledger', 'csv')}>
                        CSV
                      </Button>
                    </div>
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={ledgerGridRef}
                        theme="legacy"
                        rowData={ledgerRows}
                        columnDefs={ledgerCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="maintenance" className="mt-4">
                    <div className="flex gap-2 flex-wrap mb-3">
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('maintenance', 'pdf')}>
                        PDF
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('maintenance', 'excel')}>
                        Excel
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('maintenance', 'csv')}>
                        CSV
                      </Button>
                    </div>
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={maintGridRef}
                        theme="legacy"
                        rowData={maintenanceRows}
                        columnDefs={maintCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="water" className="mt-4">
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={waterGridRef}
                        theme="legacy"
                        rowData={waterBillRows}
                        columnDefs={waterCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="messages" className="mt-4">
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={messageGridRef}
                        theme="legacy"
                        rowData={messageRows}
                        columnDefs={messageCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="documents" className="mt-4">
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={docGridRef}
                        theme="legacy"
                        rowData={documentRows}
                        columnDefs={documentCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="leases" className="mt-4">
                    <div className="flex gap-2 flex-wrap mb-3">
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('leases', 'pdf')}>
                        PDF
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('leases', 'excel')}>
                        Excel
                      </Button>
                      <Button variant="outline" disabled={exporting} onClick={() => exportTab('leases', 'csv')}>
                        CSV
                      </Button>
                    </div>
                    <div className="ag-theme-quartz w-full h-[520px] rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <AgGridReact
                        ref={leaseGridRef}
                        theme="legacy"
                        rowData={leaseRows}
                        columnDefs={leaseCols}
                        defaultColDef={{ sortable: true, resizable: true, filter: true }}
                        pagination
                        paginationPageSize={25}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteInput('')
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tenant permanently</DialogTitle>
            <DialogDescription>
              This will remove the tenant account, all historical records, and stored documents. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{tenantName}</p>
            <Separator className="my-3" />
            <p>Email: {data?.tenant?.email || '—'}</p>
            <p>Archived: {archivedAt}</p>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <p>Type <span className="font-semibold text-slate-900">delete</span> to confirm.</p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="delete"
            />
            {deleteError ? <p className="text-sm text-rose-600">{deleteError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:space-x-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTenant}
              disabled={deleting || deleteInput.trim().toLowerCase() !== 'delete'}
            >
              {deleting ? 'Deleting...' : 'Delete tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteSummaryOpen}
        onOpenChange={(open) => {
          setDeleteSummaryOpen(open)
          if (!open) {
            setDeleteSummary(null)
            setDeletedTenantName(null)
            setDeletedTenantEmail(null)
            if (deleteSucceeded) {
              router.push('/dashboard/tenants/archive')
            }
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tenant removal summary</DialogTitle>
            <DialogDescription>
              {deleteSummary?.errors?.length ? 'Completed with warnings. Review the items below.' : 'Deletion completed successfully.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Deleted tenant</p>
                  <p className="text-lg font-semibold">{deletedTenantName || tenantName}</p>
                  <p className="text-xs text-slate-300">{deletedTenantEmail || data?.tenant?.email || '—'}</p>
                </div>
                <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  {deleteSummary?.errors?.length ? 'Warnings' : 'Success'}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Deleted records</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {deleteRecordEntries.length ? (
                    deleteRecordEntries.map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No records removed.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Storage cleanup</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {deleteStorageEntries.length ? (
                    deleteStorageEntries.map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No files removed.</p>
                  )}
                </div>
              </div>
            </div>

            {deleteSummary?.errors?.length ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <p className="text-xs font-semibold uppercase">Warnings</p>
                <ul className="mt-2 space-y-2">
                  {deleteSummary.errors.map((item, index) => (
                    <li key={`${item.step}-${index}`} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-rose-500" />
                      <span>
                        <span className="font-semibold">{item.step}</span>: {item.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:space-x-2">
            <Button variant="outline" onClick={() => setDeleteSummaryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
