'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CreditCard, Smartphone, UploadCloud } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'

export default function TenantPaymentPortal() {
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const invoiceAmount = Number(searchParams?.get('amount') || 1870)
  const invoiceStatusParam = searchParams?.get('status')
  const isInvoicePaid = invoiceStatusParam === 'true'
  const invoiceMonth = searchParams?.get('period') || 'November 2025'
  const propertyName = searchParams?.get('property') || 'Cedar Ridge Apartments'
  const unitLabel = searchParams?.get('unit') || 'B-402'

  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card' | 'bank'>('mpesa')
  const [mpesaNumber, setMpesaNumber] = useState('')
  const [cardDetails, setCardDetails] = useState({ name: '', number: '', expiry: '', cvv: '' })
  const [depositSnapshot, setDepositSnapshot] = useState<File | null>(null)
  const [depositNotes, setDepositNotes] = useState('')

  const formattedAmount = useMemo(
    () =>
      `KES ${invoiceAmount.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    [invoiceAmount]
  )

  const handleDepositUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setDepositSnapshot(file)
    }
  }

  const handleConfirm = () => {
    const methodMap = {
      mpesa: 'M-Pesa STK push (coming soon)',
      card: 'Visa / Mastercard checkout (coming soon)',
      bank: 'Manual bank transfer with deposit slip',
    }

    toast({
      title: 'Payment action recorded',
      description: `You selected ${methodMap[paymentMethod]}. We'll activate this workflow shortly.`,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Invoice for {invoiceMonth}</p>
            <h1 className="text-3xl font-bold">Secure Payment</h1>
          </div>
          <Badge className={`ml-auto ${isInvoicePaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isInvoicePaid ? 'Paid' : 'Unpaid'}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-[2fr,3fr] gap-6">
          <Card className="shadow-md border-blue-100">
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
              <CardDescription>Review the bill before you pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Amount due</p>
                <p className="text-4xl font-semibold text-[#4682B4]">{formattedAmount}</p>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between border rounded-xl px-4 py-3 bg-blue-50/60">
                  <span className="text-muted-foreground">Property</span>
                  <span className="font-medium">{propertyName}</span>
                </div>
                <div className="flex justify-between border rounded-xl px-4 py-3">
                  <span className="text-muted-foreground">Unit</span>
                  <span className="font-medium">{unitLabel}</span>
                </div>
                <div className="flex justify-between border rounded-xl px-4 py-3">
                  <span className="text-muted-foreground">Billing period</span>
                  <span className="font-medium">{invoiceMonth}</span>
                </div>
              </div>
              <Alert className="bg-slate-50 border-slate-200">
                <AlertDescription className="text-xs text-muted-foreground">
                  We will integrate live payment rails soon. For now, choose your preferred option to keep a record and follow the instructions provided.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Choose payment method</CardTitle>
              <CardDescription>Switch between Mpesa, card, or bank transfer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'mpesa' | 'card' | 'bank')} className="space-y-3">
                <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${paymentMethod === 'mpesa' ? 'border-[#4682B4] bg-[#e8f1fb]' : 'border-slate-200'}`}>
                  <RadioGroupItem value="mpesa" id="mpesa-option" />
                  <Label htmlFor="mpesa-option" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-white shadow">
                        <Smartphone className="h-5 w-5 text-[#4682B4]" />
                      </div>
                      <div>
                        <p className="font-semibold">M-Pesa (STK push)</p>
                        <p className="text-xs text-muted-foreground">Receive a prompt on your phone to approve payment.</p>
                      </div>
                    </div>
                  </Label>
                </div>

                <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${paymentMethod === 'card' ? 'border-[#4682B4] bg-[#e8f1fb]' : 'border-slate-200'}`}>
                  <RadioGroupItem value="card" id="card-option" />
                  <Label htmlFor="card-option" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-white shadow">
                        <CreditCard className="h-5 w-5 text-[#4682B4]" />
                      </div>
                      <div>
                        <p className="font-semibold">Visa / Mastercard</p>
                        <p className="text-xs text-muted-foreground">Secure checkout powered by our payment gateway.</p>
                      </div>
                    </div>
                  </Label>
                </div>

                <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${paymentMethod === 'bank' ? 'border-[#4682B4] bg-[#e8f1fb]' : 'border-slate-200'}`}>
                  <RadioGroupItem value="bank" id="bank-option" />
                  <Label htmlFor="bank-option" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-white shadow">
                        <UploadCloud className="h-5 w-5 text-[#4682B4]" />
                      </div>
                      <div>
                        <p className="font-semibold">Bank transfer / slip upload</p>
                        <p className="text-xs text-muted-foreground">Transfer to our account and upload proof of payment.</p>
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>

              {paymentMethod === 'mpesa' && (
                <div className="space-y-3 rounded-2xl border bg-green-50/50 p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-green-600" /> Mpesa details (coming soon)
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="mpesa-number">M-Pesa phone number</Label>
                    <Input
                      id="mpesa-number"
                      type="tel"
                      placeholder="2547XXXXXXXX"
                      value={mpesaNumber}
                      onChange={(event) => setMpesaNumber(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">We will send an STK push to this number once Daraja integration is live.</p>
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-3 rounded-2xl border bg-blue-50/50 p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-blue-600" /> Card checkout (coming soon)
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="card-name">Card holder</Label>
                    <Input
                      id="card-name"
                      placeholder="Full name on card"
                      value={cardDetails.name}
                      onChange={(event) => setCardDetails((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-number">Card number</Label>
                    <Input
                      id="card-number"
                      placeholder="1234 5678 9012 3456"
                      value={cardDetails.number}
                      onChange={(event) => setCardDetails((prev) => ({ ...prev, number: event.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="card-expiry">Expiry</Label>
                      <Input
                        id="card-expiry"
                        placeholder="MM/YY"
                        value={cardDetails.expiry}
                        onChange={(event) => setCardDetails((prev) => ({ ...prev, expiry: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
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
              )}

              {paymentMethod === 'bank' && (
                <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Bank deposit instructions</h3>
                    <p className="text-xs text-muted-foreground">Transfer to Equity Bank • Acc Name: RentMaster Ltd • Acc No: 0123456789 • Ref: {unitLabel}-{invoiceMonth.replace(' ', '')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit-upload">Upload deposit slip</Label>
                    <Input id="deposit-upload" type="file" accept="image/*,application/pdf" onChange={handleDepositUpload} />
                    {depositSnapshot && (
                      <p className="text-xs text-muted-foreground">Uploaded: {depositSnapshot.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit-notes">Additional notes</Label>
                    <Textarea
                      id="deposit-notes"
                      rows={3}
                      placeholder="Add any additional information about your transfer..."
                      value={depositNotes}
                      onChange={(event) => setDepositNotes(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <Button onClick={handleConfirm} className="w-full gap-2 bg-[#4682B4] hover:bg-[#3b6c99]">
                <CheckCircle2 className="h-5 w-5" />
                Confirm payment option
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
