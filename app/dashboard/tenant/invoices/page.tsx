'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CreditCard, Download, FileText } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth/context'
import { downloadInvoicePdf } from '@/lib/invoices/invoicePdf'
import { fetchCurrentOrganizationBrand, type ResolvedOrganizationBrand } from '@/lib/exports/letterhead'

type TenantInvoiceRecord = {
  id: string
  amount: number
  due_date: string | null
  status: boolean
  invoice_type: string | null
  description: string | null
  months_covered: number
  property_name: string | null
  unit_label: string | null
  created_at?: string | null
  raw_status?: string | null
  is_covered?: boolean
  is_prestart?: boolean
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const formatAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'KES 0'
  return `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
}

export default function TenantInvoicesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [tenantName, setTenantName] = useState('Tenant')
  const [orgBrand, setOrgBrand] = useState<ResolvedOrganizationBrand | null>(null)
  const [logoBytes, setLogoBytes] = useState<Uint8Array | null>(null)

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/tenant/invoices', { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load invoices.')
        }
        setInvoices(payload.data || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load invoices.')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [])

  useEffect(() => {
    let alive = true
    const loadSummary = async () => {
      try {
        const response = await fetch('/api/tenant/summary', { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.success) return
        const name = payload?.data?.profile?.full_name
        if (alive && name) setTenantName(String(name))
      } catch {
        // ignore
      }
    }
    loadSummary()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const loadOrg = async () => {
      const brand = await fetchCurrentOrganizationBrand()
      if (!alive) return
      setOrgBrand(brand)
      if (brand?.logo_url) {
        try {
          const res = await fetch(brand.logo_url)
          if (!res.ok) return
          const bytes = new Uint8Array(await res.arrayBuffer())
          if (alive) setLogoBytes(bytes)
        } catch {
          // ignore
        }
      }
    }
    loadOrg()
    return () => {
      alive = false
    }
  }, [])

  const normalized = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const isPaid = Boolean(invoice.status || invoice.is_covered)
      if (statusFilter === 'paid' && !isPaid) return false
      if (statusFilter === 'unpaid' && isPaid) return false

      if (!term) return true
      const typeLabel = (invoice.invoice_type || 'rent').toLowerCase()
      const description = (invoice.description || '').toLowerCase()
      const property = (invoice.property_name || '').toLowerCase()
      const unit = (invoice.unit_label || '').toLowerCase()
      const due = (invoice.due_date || '').toLowerCase()
      return [typeLabel, description, property, unit, due].some((val) => val.includes(term))
    })
  }, [invoices, searchTerm, statusFilter])

  const totals = useMemo(() => {
    const paid = invoices.filter((invoice) => invoice.status || invoice.is_covered).length
    return {
      total: invoices.length,
      paid,
      unpaid: invoices.length - paid,
    }
  }, [invoices])

  const handleDownloadInvoice = async (invoice: TenantInvoiceRecord) => {
    const periodLabel = invoice.due_date?.slice(0, 7) || invoice.created_at?.slice(0, 7) || '-'
    const dueDateLabel = invoice.due_date?.slice(0, 10) || '-'
    const propertyName = invoice.property_name || orgBrand?.name || 'Property'
    const unitNumber = invoice.unit_label || '-'
    const lineItemLabel = invoice.invoice_type === 'water' ? 'Water Bill' : 'Monthly Rent'
    const statusLabel = invoice.status || invoice.is_covered ? 'Paid' : 'Unpaid'

    await downloadInvoicePdf(
      {
        logoBytes: logoBytes || undefined,
        orgEmail: orgBrand?.email ?? undefined,
        orgPhone: orgBrand?.phone ?? undefined,
        invoiceId: invoice.id,
        periodLabel,
        statusLabel,
        tenantName,
        tenantEmail: user?.email || '-',
        propertyName,
        unitNumber,
        dueDateLabel,
        rentAmount: Number(invoice.amount || 0),
        arrearsAmount: 0,
        lineItemLabel,
        currencyPrefix: 'KES',
      },
      `invoice-${periodLabel}-${invoice.id.slice(0, 6)}.pdf`
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-blue-50/20">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/tenant')}
            className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Invoices</h1>
            <p className="text-sm text-muted-foreground">Track paid and unpaid invoices in one place.</p>
          </div>
        </div>

        {error ? (
          <Card>
            <CardContent className="p-4 text-sm text-rose-600">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total invoices</CardDescription>
              <CardTitle className="text-2xl">{totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">{totals.paid}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unpaid</CardDescription>
              <CardTitle className="text-2xl text-rose-600">{totals.unpaid}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invoice list</CardTitle>
            <CardDescription>Click an unpaid invoice to open the secure payment page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_160px]">
              <Input
                placeholder="Search by month, property, or type"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All invoices</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setSearchTerm('')}>Clear</Button>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading invoices...</div>
            ) : normalized.length === 0 ? (
              <div className="text-sm text-muted-foreground">No invoices match your filters.</div>
            ) : (
              <div className="space-y-3">
                {normalized.map((invoice) => {
                  const isPaid = Boolean(invoice.status || invoice.is_covered)
                  const rawStatus = typeof invoice.raw_status === 'string' ? invoice.raw_status.toLowerCase() : ''
                  const statusLabel = isPaid ? 'Paid' : rawStatus || 'Unpaid'
                  const isOverdue = !isPaid && ['overdue', 'late'].includes(rawStatus)
                  const badgeClass = isPaid
                    ? 'bg-emerald-100 text-emerald-700'
                    : isOverdue
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'

                  const payDisabled = isPaid || invoice.is_prestart
                  const canPay = !payDisabled
                  const handleRowClick = () => {
                    if (!canPay) return
                    router.push(`/dashboard/tenant/payment?invoiceId=${invoice.id}`)
                  }
                  const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation()
                    void handleDownloadInvoice(invoice)
                  }

                  return (
                    <div
                      key={invoice.id}
                      className={`flex flex-col gap-4 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${canPay ? 'cursor-pointer' : ''}`}
                      onClick={handleRowClick}
                      role={canPay ? 'button' : undefined}
                      tabIndex={canPay ? 0 : -1}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 rounded-lg bg-blue-50 p-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {invoice.invoice_type === 'water' ? 'Water Bill' : 'Rent Invoice'}
                            </p>
                            <Badge className={badgeClass}>{statusLabel}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Due: {formatDate(invoice.due_date)} - {formatAmount(invoice.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {invoice.property_name || 'Property'}{invoice.unit_label ? ` - Unit ${invoice.unit_label}` : ''}
                          </p>
                          {invoice.is_covered ? (
                            <p className="text-xs text-emerald-600">Covered by advance payment.</p>
                          ) : null}
                          {invoice.is_prestart ? (
                            <p className="text-xs text-slate-500">Scheduled before lease start.</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <p className="text-lg font-semibold">{formatAmount(invoice.amount)}</p>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button variant="outline" size="sm" onClick={handleDownloadClick}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            asChild
                            disabled={payDisabled}
                            variant={payDisabled ? 'outline' : 'default'}
                            className={payDisabled ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                          >
                            <Link href={`/dashboard/tenant/payment?invoiceId=${invoice.id}`}>
                              <CreditCard className="mr-2 h-4 w-4" />
                              {payDisabled ? 'Paid' : 'Pay now'}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
