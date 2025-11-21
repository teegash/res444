'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

type TenantPaymentRecord = {
  id: string
  invoice_id: string | null
  amount_paid: number
  payment_method: string | null
  verified: boolean
  created_at: string | null
  mpesa_receipt_number?: string | null
  bank_reference_number?: string | null
  months_paid: number
  invoice_type: string | null
  due_date: string | null
  property_name: string | null
  unit_label: string | null
}

type PendingInvoice = {
  id: string
  due_date: string | null
  amount: number
}

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<TenantPaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterMethod, setFilterMethod] = useState<string>('all')
  const [searchMonth, setSearchMonth] = useState('')
  const [upcomingInvoice, setUpcomingInvoice] = useState<PendingInvoice | null>(null)

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true)
      const [paymentsResp, pendingResp] = await Promise.all([
        fetch('/api/tenant/payments', { cache: 'no-store' }),
        fetch('/api/tenant/invoices?status=pending', { cache: 'no-store' }),
      ])

      if (!paymentsResp.ok) {
        const payload = await paymentsResp.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load payments.')
      }
      const paymentsPayload = await paymentsResp.json()
      setPayments(paymentsPayload.data || [])

      if (pendingResp.ok) {
        const pendingPayload = await pendingResp.json().catch(() => ({}))
        const next = (pendingPayload.data || [])[0]
        if (next) {
          setUpcomingInvoice({
            id: next.id,
            due_date: next.due_date,
            amount: Number(next.amount),
          })
        } else {
          setUpcomingInvoice(null)
        }
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (filterMethod !== 'all' && payment.payment_method !== filterMethod) return false
      if (searchMonth) {
        const label = payment.due_date
          ? new Date(payment.due_date).toLocaleDateString(undefined, { month: 'long' }).toLowerCase()
          : ''
        if (!label.includes(searchMonth.toLowerCase())) return false
      }
      return true
    })
  }, [payments, filterMethod, searchMonth])

  const totalPaidLastSix = useMemo(() => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    return payments
      .filter((p) => p.verified && p.created_at && new Date(p.created_at) >= sixMonthsAgo)
      .reduce((sum, payment) => sum + payment.amount_paid, 0)
  }, [payments])

  const onTimeRate = useMemo(() => {
    if (payments.length === 0) return 0
    const onTime = payments.filter((p) => p.verified).length
    return Math.round((onTime / payments.length) * 100)
  }, [payments])

  const averageMonthly = useMemo(() => {
    if (payments.length === 0) return 0
    const totalMonths = payments.reduce((acc, payment) => acc + payment.months_paid, 0)
    return totalMonths > 0 ? Math.round(payments.reduce((sum, p) => sum + p.amount_paid, 0) / totalMonths) : 0
  }, [payments])

  const statementSummaries = useMemo(() => {
    const map = new Map<string, { period: string; date: string; id: string }>()
    payments.forEach((payment) => {
      if (!payment.due_date) return
      const date = new Date(payment.due_date)
      const key = `${date.getFullYear()}-${date.getMonth()}`
      if (!map.has(key)) {
        map.set(key, {
          period: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
          date: date.toLocaleDateString(),
          id: payment.invoice_id || payment.id,
        })
      }
    })
    return Array.from(map.values()).slice(0, 4)
  }, [payments])

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Payment History</h1>
          </div>
          <Button className="ml-auto" variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download Statement
          </Button>
        </div>

        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Paid (Last 6 months)</CardDescription>
              <CardTitle className="text-3xl text-green-600">KES {totalPaidLastSix.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>On-time Payment Rate</CardDescription>
              <CardTitle className="text-3xl text-blue-600">{onTimeRate}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Avg. Monthly Payment</CardDescription>
              <CardTitle className="text-3xl text-purple-600">KES {averageMonthly.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Upcoming Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Payments</CardTitle>
            <CardDescription>Your next rent payments</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingInvoice ? (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-semibold">
                    {upcomingInvoice.due_date
                      ? new Date(upcomingInvoice.due_date).toLocaleDateString(undefined, {
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Next Rent'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Due: {upcomingInvoice.due_date ? new Date(upcomingInvoice.due_date).toLocaleDateString() : 'Soon'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold">KES {upcomingInvoice.amount.toLocaleString()}</p>
                    <Badge variant="outline">Due</Badge>
                  </div>
                  <Link href={`/dashboard/tenant/payment?intent=rent&invoiceId=${upcomingInvoice.id}`}>
                    <Button>Pay Now</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You have no pending rent invoices right now.</p>
            )}
          </CardContent>
        </Card>

        {/* Account Statements */}
        <Card>
          <CardHeader>
            <CardTitle>Account Statements</CardTitle>
            <CardDescription>Your recent statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statementSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No statements generated yet.</p>
            ) : (
              statementSummaries.map((statement) => (
                <div key={statement.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Statement: {statement.period}</p>
                      <p className="text-sm text-muted-foreground">Generated on {statement.date}</p>
                    </div>
                  </div>
                  <Link href={`/dashboard/tenant/statements/${statement.id}`}>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      View Statement
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Input
                placeholder="Search by month..."
                value={searchMonth}
                onChange={(event) => setSearchMonth(event.target.value)}
              />
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={fetchPayments}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>All your rent payment records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading payments…</p>
            ) : filteredPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments match your filters.</p>
            ) : (
              filteredPayments.map((payment) => {
                const labelDate = payment.due_date
                  ? new Date(payment.due_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                  : payment.created_at
                    ? new Date(payment.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                    : 'Payment'

                const reference =
                  payment.payment_method === 'mpesa'
                    ? payment.mpesa_receipt_number
                    : payment.payment_method === 'bank_transfer'
                      ? payment.bank_reference_number
                      : payment.invoice_id

                return (
                  <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-green-100 rounded">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{labelDate}</p>
                        <p className="text-sm text-muted-foreground">
                          {(payment.payment_method || 'Unknown').replace('_', ' ').toUpperCase()} • Ref:{' '}
                          {reference || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payment.property_name || 'Property'} {payment.unit_label ? `· ${payment.unit_label}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">KES {payment.amount_paid.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <Badge className={payment.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                        {payment.verified ? 'Paid' : 'Pending'}
                      </Badge>
                      <Link href={`/dashboard/tenant/receipts/${payment.id}`}>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          View Receipt
                        </Button>
                      </Link>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
