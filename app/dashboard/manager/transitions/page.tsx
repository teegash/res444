'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, ArrowRight, ArrowLeft, Download } from 'lucide-react'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF, ExportColumn } from '@/lib/export/download'

type TransitionRow = any

const statusColor = (status?: string) => {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'bg-emerald-100 text-emerald-800'
  if (s === 'rejected' || s === 'cancelled') return 'bg-slate-100 text-slate-700'
  if (s === 'approved') return 'bg-blue-100 text-blue-800'
  if (s === 'acknowledged') return 'bg-amber-100 text-amber-800'
  return 'bg-purple-100 text-purple-800'
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString()
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `KES ${Number(value).toLocaleString()}`
}

export default function ManagerTransitionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TransitionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [stage, setStage] = useState<string>('all')
  const [caseType, setCaseType] = useState<string>('all')

  const fetchRows = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (stage !== 'all') params.set('stage', stage)
      if (caseType !== 'all') params.set('case_type', caseType)
      if (search.trim()) params.set('search', search.trim())

      const res = await fetch(`/api/tenant-transitions?${params.toString()}`, { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load transitions.')

      setRows(payload.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transitions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRows()
  }, [])

  const visible = useMemo(() => rows, [rows])

  const exportColumns: ExportColumn<TransitionRow>[] = [
    { header: 'Tenant', accessor: (row) => row.tenant?.full_name || 'Tenant' },
    { header: 'Unit', accessor: (row) => row.unit?.unit_number || '—' },
    { header: 'Property', accessor: (row) => row.unit?.building?.name || 'Property' },
    { header: 'Case Type', accessor: (row) => row.case_type || '—' },
    { header: 'Status', accessor: (row) => row.status || '—' },
    { header: 'Stage', accessor: (row) => row.stage || '—' },
    { header: 'Expected Vacate', accessor: (row) => formatDate(row.expected_vacate_date) },
    { header: 'Handover', accessor: (row) => formatDate(row.handover_date) },
    { header: 'Actual Vacate', accessor: (row) => formatDate(row.actual_vacate_date) },
    { header: 'Deposit', accessor: (row) => formatCurrency(row.deposit_amount) },
    { header: 'Deductions', accessor: (row) => formatCurrency(row.deposit_deductions) },
    { header: 'Refund', accessor: (row) => formatCurrency(row.deposit_refund_amount) },
    { header: 'Refund Status', accessor: (row) => row.refund_status || '—' },
    { header: 'Damage Cost', accessor: (row) => formatCurrency(row.damage_cost) },
    { header: 'Created', accessor: (row) => formatDate(row.created_at) },
  ]

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    const filename = `tenant-transitions-${new Date().toISOString().slice(0, 10)}`
    const subtitle = `Status: ${status}. Stage: ${stage}. Type: ${caseType}. Search: ${search || '—'}.`
    const letterhead = { documentTitle: 'Tenant Transitions', generatedAtISO: new Date().toISOString() }

    if (format === 'pdf') {
      await exportRowsAsPDF(filename, exportColumns, visible, {
        title: 'Tenant Transitions',
        subtitle,
        orientation: 'landscape',
        tableStyles: {
          fontSize: 7.25,
          cellPadding: 3,
          lineHeightFactor: 1.1,
        },
      })
    } else if (format === 'excel') {
      await exportRowsAsExcel(filename, exportColumns, visible, undefined, { letterhead })
    } else {
      await exportRowsAsCSV(filename, exportColumns, visible, undefined, { letterhead })
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold mt-2">Tenant transitions</h1>
              <p className="text-sm text-muted-foreground">
                Move-out, inspections, deposit settlement, and unit handover tracking.
              </p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Move-out & Deposit Settlement</CardTitle>
              <CardDescription>Track vacate/relocation/eviction transitions, inspections, and refunds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing {visible.length} case{visible.length === 1 ? '' : 's'}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleExport('pdf')} disabled={loading || visible.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" onClick={() => handleExport('excel')} disabled={loading || visible.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                  <Button variant="outline" onClick={() => handleExport('csv')} disabled={loading || visible.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 w-full md:w-[280px]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tenant / unit / property..."
                  />
                </div>

                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full md:w-[170px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="submitted">submitted</SelectItem>
                    <SelectItem value="acknowledged">acknowledged</SelectItem>
                    <SelectItem value="approved">approved</SelectItem>
                    <SelectItem value="rejected">rejected</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="w-full md:w-[190px]">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    <SelectItem value="opened">opened</SelectItem>
                    <SelectItem value="handover_scheduled">handover_scheduled</SelectItem>
                    <SelectItem value="inspected">inspected</SelectItem>
                    <SelectItem value="deposit_settled">deposit_settled</SelectItem>
                    <SelectItem value="vacated">vacated</SelectItem>
                    <SelectItem value="unit_turned_over">unit_turned_over</SelectItem>
                    <SelectItem value="onboarded_new_tenant">onboarded_new_tenant</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Select value={caseType} onValueChange={setCaseType}>
                    <SelectTrigger className="w-full md:w-[170px]">
                      <SelectValue placeholder="Case type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="vacate_notice">vacate_notice</SelectItem>
                      <SelectItem value="relocation">relocation</SelectItem>
                      <SelectItem value="eviction">eviction</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={fetchRows} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Filter'}
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : null}

              <div className="space-y-3">
                {loading ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </div>
                ) : visible.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No transition cases found.</div>
                ) : (
                  visible.map((row: any) => (
                    <Card key={row.id} className="border">
                      <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={statusColor(row.status)}>{row.status}</Badge>
                            <Badge variant="secondary">{row.stage}</Badge>
                            <Badge variant="outline">{row.case_type}</Badge>
                          </div>

                          <div className="mt-2 font-medium truncate">
                            {row.tenant?.full_name || 'Tenant'} • Unit {row.unit?.unit_number || '—'} •{' '}
                            {row.unit?.building?.name || 'Property'}
                          </div>

                          <div className="text-xs text-muted-foreground mt-1">
                            Expected vacate: {row.expected_vacate_date || '—'} • Handover: {row.handover_date || '—'}
                          </div>
                        </div>

                        <Link href={`/dashboard/manager/transitions/${row.id}`}>
                          <Button variant="outline" className="gap-2">
                            View <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
