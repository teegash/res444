'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ArrowLeft, Loader2, Smartphone, CreditCard } from 'lucide-react'

interface InvoiceDetail {
  id: string
  amount: number
  status: boolean | null
  is_paid?: boolean
  description: string | null
  invoice_type: string | null
  due_date: string | null
  created_at: string | null
  unit: {
    id: string | null
    label: string | null
  }
  property: {
    id: string | null
    name: string | null
    location: string | null
  } | null
}

export default function TenantInvoicePaymentPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = useMemo(() => {
    const raw = params?.invoiceId
    return Array.isArray(raw) ? raw[0] : raw
  }, [params])

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'mpesa' | 'card'>('mpesa')
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvv: '' })

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!invoiceId) return
      try {
        setLoading(true)
        const response = await fetch(`/api/tenant/invoices/${invoiceId}`, { cache: 'no-store' })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to load invoice.')
        }
        const payload = await response.json()
        setInvoice(payload.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load invoice.')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [invoiceId])

  const formatCurrency = (value: number | null | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'KES 0.00'
    return `KES ${value.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50/30 via-white to-white">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading invoice…
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50/20 via-white to-white">
        <div className="max-w-md w-full p-6">
          <Alert variant="destructive">
            <AlertDescription>{error || 'Invoice not found.'}</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/tenant')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/30 via-white to-white">
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Invoice #{invoice.id.slice(0, 8)}</p>
            <h1 className="text-2xl font-bold">Pay Water Bill</h1>
          </div>
          <Badge className={`ml-auto ${invoice.is_paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {invoice.is_paid ? 'true' : 'false'}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
            <CardDescription>Review the bill before choosing a payment method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-3xl font-bold text-green-700">{formatCurrency(invoice.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="text-lg font-semibold">{formatDate(invoice.due_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Property</p>
                <p className="font-semibold">{invoice.property?.name || 'Assigned property'}</p>
                <p className="text-xs text-muted-foreground">{invoice.property?.location || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unit</p>
                <p className="font-semibold">{invoice.unit?.label || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-muted-foreground">
                {invoice.description || 'Water consumption invoice'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Payment status flag</span>
              <Badge variant={invoice.is_paid ? 'default' : 'outline'}>{invoice.is_paid ? 'true' : 'false'}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select payment method</CardTitle>
            <CardDescription>Choose Mpesa or Visa/Mastercard</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as 'mpesa' | 'card')} className="space-y-3">
              <div className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${selectedMethod === 'mpesa' ? 'border-green-500 bg-green-50/60' : 'border-muted'}`}>
                <RadioGroupItem value="mpesa" id="mpesa" />
                <Label htmlFor="mpesa" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-semibold">M-Pesa (STK Push)</p>
                      <p className="text-xs text-muted-foreground">Receive an STK prompt on your phone</p>
                    </div>
                  </div>
                </Label>
              </div>
              <div className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${selectedMethod === 'card' ? 'border-blue-500 bg-blue-50/60' : 'border-muted'}`}>
                <RadioGroupItem value="card" id="card" />
                <Label htmlFor="card" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-semibold">Visa / Mastercard</p>
                      <p className="text-xs text-muted-foreground">Secure card checkout (coming soon)</p>
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {selectedMethod === 'mpesa' && (
          <Card className="border-green-200 bg-green-50/40">
            <CardHeader>
              <CardTitle>M-Pesa payment</CardTitle>
              <CardDescription>Enter your number to receive an STK prompt</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  We will integrate Daraja soon. For now, the button below confirms you intend to pay via M-Pesa.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="mpesa-phone">M-Pesa Phone Number</Label>
                <Input
                  id="mpesa-phone"
                  type="tel"
                  placeholder="2547XXXXXXXX"
                  value={mpesaPhone}
                  onChange={(event) => setMpesaPhone(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Use the number that will authorize the payment.</p>
              </div>
              <Button disabled className="w-full">
                M-Pesa payment coming soon
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedMethod === 'card' && (
          <Card className="border-blue-200 bg-blue-50/40">
            <CardHeader>
              <CardTitle>Card payment</CardTitle>
              <CardDescription>Enter your card details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Card processing will be enabled soon. You can review the inputs that will be required below.
                </AlertDescription>
              </Alert>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="card-number">Card Number</Label>
                  <Input
                    id="card-number"
                    placeholder="1234 5678 9012 3456"
                    value={cardDetails.number}
                    onChange={(event) => setCardDetails((prev) => ({ ...prev, number: event.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="card-expiry">Expiry</Label>
                    <Input
                      id="card-expiry"
                      placeholder="MM/YY"
                      value={cardDetails.expiry}
                      onChange={(event) => setCardDetails((prev) => ({ ...prev, expiry: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="card-cvv">CVV</Label>
                    <Input
                      id="card-cvv"
                      placeholder="123"
                      value={cardDetails.cvv}
                      onChange={(event) => setCardDetails((prev) => ({ ...prev, cvv: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <Button disabled className="w-full">
                Card payments coming soon
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
