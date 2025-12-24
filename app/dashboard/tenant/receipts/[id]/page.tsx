'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Loader2, Printer, Share2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { downloadReceiptPdf } from '@/lib/payments/receiptPdf'

type ReceiptPayload = {
  payment: {
    id: string
    amount: number
    method: string | null
    status: string
    created_at: string | null
    payment_date: string | null
    mpesa_receipt_number: string | null
    bank_reference_number: string | null
    notes: string | null
    months_paid: number
    coverage_label: string
  }
  invoice: {
    id: string
    type: string | null
    amount: number
    due_date: string | null
    description: string | null
  } | null
  property: {
    property_name: string | null
    property_location: string | null
    unit_number: string | null
  } | null
  tenant: {
    name: string
    phone_number: string | null
    address: string | null
  }
}

export default function TenantReceiptPage({ params }: { params: { id: string } }) {
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        if (!params?.id || params.id === 'undefined' || params.id === 'null') {
          setError('Receipt is unavailable for this payment.')
          setReceipt(null)
          setLoading(false)
          return
        }
        setLoading(true)
        const response = await fetch(`/api/tenant/receipts/${params.id}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load receipt.')
        }
        setReceipt(payload.data || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load receipt.')
        setReceipt(null)
      } finally {
        setLoading(false)
      }
    }

    fetchReceipt()
  }, [params.id])

  const formatCurrency = (value: number) =>
    `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const paymentDate = receipt?.payment.payment_date
    ? new Date(receipt.payment.payment_date).toLocaleDateString()
    : ''

  const reference =
    receipt?.payment.mpesa_receipt_number ||
    receipt?.payment.bank_reference_number ||
    receipt?.payment.id

  const propertyLabel = useMemo(() => {
    if (!receipt?.property) return 'My Unit'
    const parts = [receipt.property.property_name, receipt.property.unit_number].filter(Boolean)
    return parts.join(' - ') || 'My Unit'
  }, [receipt?.property])

  const handleShare = async () => {
    if (!receipt) return
    const sharePayload = {
      title: 'Payment Receipt',
      text: `Receipt for ${formatCurrency(receipt.payment.amount)} (${propertyLabel})`,
      url: window.location.href,
    }

    if (navigator.share) {
      await navigator.share(sharePayload)
    } else {
      await navigator.clipboard.writeText(sharePayload.url)
      alert('Receipt link copied to clipboard.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading receipt…
        </div>
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 space-y-3 text-center">
            <p className="text-sm text-red-600">{error || 'Receipt data unavailable.'}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/tenant/payments">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Payment Receipt</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button size="sm" onClick={() => void downloadReceiptPdf(receipt)}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-8 md:p-12">
            <div className="flex items-start justify-between mb-8 pb-6 border-b">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <span className="text-2xl">🏢</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-green-600">RES</h2>
                  <p className="text-sm text-muted-foreground">Property Management</p>
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold">RECEIPT</h3>
                <p className="text-sm text-muted-foreground">#{receipt.payment.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Date</p>
                <p className="font-semibold">{paymentDate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
                <p className="font-semibold capitalize">
                  {receipt.payment.method ? receipt.payment.method.replace('_', ' ') : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Received From</p>
                <p className="font-semibold">{receipt.tenant.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Reference</p>
                <p className="font-semibold font-mono break-all">{reference}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Property</p>
                <p className="font-semibold">{propertyLabel}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Coverage</p>
                <p className="font-semibold">{receipt.payment.coverage_label}</p>
              </div>
            </div>

            <div className="mb-8">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Description</th>
                    <th className="text-right p-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-3">
                      {receipt.invoice?.description ||
                        (receipt.invoice?.type === 'water'
                          ? 'Water bill payment'
                          : 'Rent payment')}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatCurrency(receipt.payment.amount)}
                    </td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="p-3 font-bold">Total Paid</td>
                    <td className="p-3 text-right text-xl font-bold text-green-600">
                      {formatCurrency(receipt.payment.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-green-50 p-6 rounded-lg text-center mb-8">
              <p className="text-lg font-semibold text-green-900 mb-2">Thank you for your payment!</p>
              <p className="text-sm text-green-700">
                For any inquiries, please contact us at support@res.com or call +254 712 345 678
              </p>
            </div>

            <div className="pt-6 border-t text-center text-sm text-muted-foreground">
              <p>RES Ltd. | P.O. Box 12345-00100, Nairobi | www.res.com</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
