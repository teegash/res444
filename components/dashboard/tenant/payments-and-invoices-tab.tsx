'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileDown, CreditCard, CheckCircle, Calendar, Loader2 } from 'lucide-react'

type TenantInvoice = {
  id: string
  amount: number
  due_date: string | null
  status: boolean
  invoice_type: string | null
  description: string | null
  property_name: string | null
  property_location: string | null
  unit_label: string | null
}

const paymentHistory = [
  { id: 1, date: '2024-01-05', amount: 18500, method: 'M-Pesa', status: 'Completed', ref: 'TXN123456' },
  { id: 2, date: '2023-12-01', amount: 18500, method: 'M-Pesa', status: 'Completed', ref: 'TXN123455' },
]

export function PaymentsAndInvoicesTab() {
  const [invoices, setInvoices] = useState<TenantInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/tenant/invoices', { cache: 'no-store' })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to load invoices.')
        }
        const payload = await response.json()
        setInvoices(payload.data || [])
        setError(null)
      } catch (err) {
        console.error('[PaymentsAndInvoicesTab] fetch invoices failed', err)
        setError(err instanceof Error ? err.message : 'Unable to load invoices.')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [])

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Payment Status</p>
                <p className="text-xl font-bold text-green-700">December 2024 - Paid</p>
              </div>
            </div>
            <p className="text-sm text-green-700">Paid on Dec 1, 2024</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Next Payment Due</p>
                <p className="text-xl font-bold text-blue-700">Jan 1, 2025</p>
              </div>
            </div>
            <p className="text-sm text-blue-700">KES 45,000</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Invoices</CardTitle>
          <CardDescription>Your invoices for the next months</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading invoices…
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no invoices at the moment.</p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-semibold">{invoice.invoice_type === 'water' ? 'Water Bill' : 'Rent Invoice'}</h4>
                      <Badge variant="outline">{invoice.invoice_type?.toUpperCase() || 'Invoice'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Due: {formatDate(invoice.due_date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.property_name || 'Property'} {invoice.unit_label ? `• Unit ${invoice.unit_label}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-lg font-bold text-primary">KES {invoice.amount.toLocaleString()}</p>
                      <Badge variant={invoice.status ? 'default' : 'secondary'} className={invoice.status ? 'bg-green-600' : ''}>
                        {invoice.status ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </div>
                    {!invoice.status && (
                      <Link href={`/dashboard/tenant/invoices/${invoice.id}`}>
                        <Button size="sm" className="bg-primary hover:bg-primary/90 gap-2">
                          <CreditCard className="h-4 w-4" />
                          Pay Now
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Your past payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Date</th>
                  <th className="text-left py-3 px-2">Amount</th>
                  <th className="text-left py-3 px-2">Method</th>
                  <th className="text-left py-3 px-2">Reference</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr key={payment.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">{payment.date}</td>
                    <td className="py-3 px-2 font-semibold">KES {payment.amount.toLocaleString()}</td>
                    <td className="py-3 px-2">{payment.method}</td>
                    <td className="py-3 px-2 font-mono text-xs">{payment.ref}</td>
                    <td className="py-3 px-2">
                      <Badge className="bg-green-600">{payment.status}</Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
