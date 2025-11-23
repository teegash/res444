'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Search, Eye, Download } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { exportRowsAsCSV, exportRowsAsExcel, exportRowsAsPDF } from '@/lib/export/download'

type StatementRow = {
  id: string
  tenantId?: string | null
  tenantName: string
  propertyName: string
  propertyId: string | null
  propertyLocation: string | null
  unitLabel: string
  amount: number
  paymentDate: string | null
  method: string
  receipt: string | null
}

export default function StatementsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('all')
  const [propertyId, setPropertyId] = useState('all')
  const [statements, setStatements] = useState<StatementRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    const scoped =
      propertyId === 'all'
        ? statements
        : statements.filter((row) => row.propertyId === propertyId || row.propertyName === propertyId)
    if (!term) return scoped
    return scoped.filter((row) => {
      const haystack = `${row.tenantName} ${row.propertyName} ${row.unitLabel}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [searchQuery, propertyId, statements])

  const groupedByTenant = useMemo(() => {
    const map = new Map<
      string,
      {
        tenantId: string
        tenantName: string
        properties: Set<string>
        latestDate: string | null
        total: number
        count: number
      }
    >()
    filtered.forEach((row) => {
      const key = row.tenantId || row.tenantName
      const existing = map.get(key) || {
        tenantId: row.tenantId || key,
        tenantName: row.tenantName,
        properties: new Set<string>(),
        latestDate: null,
        total: 0,
        count: 0,
      }
      if (row.propertyName) existing.properties.add(row.propertyName)
      existing.total += Number(row.amount || 0)
      existing.count += 1
      if (row.paymentDate) {
        const current = existing.latestDate ? new Date(existing.latestDate).getTime() : 0
        const incoming = new Date(row.paymentDate).getTime()
        if (incoming > current) existing.latestDate = row.paymentDate
      }
      map.set(key, existing)
    })
    return Array.from(map.values())
  }, [filtered])

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>()
    statements.forEach((row) => {
      const key = row.propertyId || row.propertyName || ''
      if (!key) return
      const label = row.propertyName || 'Property'
      map.set(key, label)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [statements])

  const loadStatements = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/manager/statements?period=${period}&propertyId=${encodeURIComponent(propertyId)}&q=${encodeURIComponent(searchQuery)}`,
        { cache: 'no-store' }
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load statements.')
      }
      setStatements(Array.isArray(payload.data) ? payload.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load statements.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatements()
  }, [period, propertyId])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStatements()
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    const fileBase = `statements-${period}-${propertyId}-${new Date().toISOString().slice(0, 10)}`
    const columns = [
      { header: 'Tenant', accessor: (row: any) => row.tenantName },
      { header: 'Properties', accessor: (row: any) => Array.from(row.properties || []).join(' • ') },
      { header: 'Transactions', accessor: (row: any) => row.count },
      { header: 'Latest Payment', accessor: (row: any) => (row.latestDate ? new Date(row.latestDate).toLocaleDateString() : '') },
      { header: 'Total Paid', accessor: (row: any) => `KES ${Number(row.total || 0).toLocaleString()}` },
    ]
    const totalAmount = groupedByTenant.reduce((sum, row) => sum + Number(row.total || 0), 0)
    const summaryRows = [['', '', '', 'Total', `KES ${totalAmount.toLocaleString()}`]]
    if (format === 'pdf') {
      exportRowsAsPDF(fileBase, columns, groupedByTenant, {
        title: 'Tenant Payment Statements',
        subtitle: `Period: ${period}, Property: ${propertyId}`,
        summaryRows,
      })
    } else if (format === 'excel') {
      exportRowsAsExcel(fileBase, columns, groupedByTenant, summaryRows)
    } else {
      exportRowsAsCSV(fileBase, columns, groupedByTenant, summaryRows)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-[#4682B4]" />
              </div>
              <h1 className="text-3xl font-bold">Financial Statements</h1>
            </div>
            <div className="flex gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Last 30 days</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="semi">6 months</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-2" onClick={() => handleExport('pdf')}>
                <Download className="w-4 h-4" />
                Export PDF
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => handleExport('excel')}>
                <Download className="w-4 h-4" />
                Export Excel
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => handleExport('csv')}>
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Filter Statements</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search tenant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {propertyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="semi">6 months</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-2">All Statements</h2>
            <p className="text-sm text-gray-600 mb-4">Each card represents a tenant’s full payment history.</p>

            <div className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading statements…</p>
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : groupedByTenant.length === 0 ? (
                <p className="text-sm text-muted-foreground">No statements found.</p>
              ) : (
                groupedByTenant.map((statement) => (
                  <Card key={statement.tenantId} className="p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                          <FileText className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1">{statement.tenantName}</h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {Array.from(statement.properties).join(' • ') || 'Property'}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Total Paid: KES {statement.total.toLocaleString()}</span>
                            <span>Transactions: {statement.count}</span>
                            <span>
                              Latest:{' '}
                              {statement.latestDate
                                ? new Date(statement.latestDate).toLocaleDateString()
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-6">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/manager/statements/${statement.tenantId}`)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
