'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CreditCard, Smartphone, UploadCloud, ShieldCheck, Lock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SkeletonLoader } from '@/components/ui/skeletons'

type InvoiceSummary = {
  id: string
  amount: number
  status: boolean | null
  invoice_type: string | null
  description: string | null
  due_date: string | null
  property_name: string | null
  property_location: string | null
  unit_label: string | null
  lease_paid_until?: string | null
}

export default function TenantPaymentPortal() {
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [loadingInvoice, setLoadingInvoice] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card' | 'bank'>('mpesa')
  const [monthsToPay, setMonthsToPay] = useState<number>(1)
  const [mpesaNumber, setMpesaNumber] = useState('')
  const [cardDetails, setCardDetails] = useState({ name: '', number: '', expiry: '', cvv: '' })
  const [depositSnapshot, setDepositSnapshot] = useState<File | null>(null)
  const [depositPreviewUrl, setDepositPreviewUrl] = useState<string | null>(null)
  const [depositNotes, setDepositNotes] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null)
  const [bankMessage, setBankMessage] = useState<string | null>(null)
  const [cardMessage, setCardMessage] = useState<string | null>(null)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)
  const [securityModalStatus, setSecurityModalStatus] = useState<'prompt' | 'success' | 'error'>('prompt')
  const [securityModalMessage, setSecurityModalMessage] = useState(
    'We are securing your request. Approve the prompt on your phone.'
  )
  const [mpesaPollPaymentId, setMpesaPollPaymentId] = useState<string | null>(null)
  const mpesaPollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const baseAmount = invoice ? invoice.amount : 0
  const totalAmount = baseAmount * monthsToPay

  const formattedAmount = useMemo(
    () => `KES ${totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [totalAmount]
  )

  const [leasePaidUntil, setLeasePaidUntil] = useState<string | null>(null)

  const coverageLabel = useMemo(() => {
    if (!invoice?.due_date) return null
    const baseDate =
      leasePaidUntil && new Date(leasePaidUntil) > new Date(invoice.due_date)
        ? new Date(leasePaidUntil)
        : new Date(invoice.due_date)
    return baseDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  }, [invoice?.due_date, leasePaidUntil])

  const paymentTitle = invoice?.invoice_type === 'water' ? 'Pay Water Bill' : 'Pay Rent'
  const showMonthsSelection = false

  const fetchInvoice = useCallback(async (): Promise<InvoiceSummary | null> => {
    try {
      setLoadingInvoice(true)
      setInvoiceError(null)
      const invoiceId = searchParams?.get('invoiceId')
      const intent = searchParams?.get('intent')
      if (invoiceId) {
        const encodedId = encodeURIComponent(invoiceId)
        const response = await fetch(`/api/tenant/invoices/${encodedId}?invoiceId=${encodedId}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load invoice.')
        }
        const fetchedInvoice: InvoiceSummary = {
          id: payload.data.id,
          amount: Number(payload.data.amount),
          status: payload.data.status,
          invoice_type: payload.data.invoice_type,
          description: payload.data.description,
          due_date: payload.data.due_date,
          property_name: payload.data.property?.name || null,
          property_location: payload.data.property?.location || null,
          unit_label: payload.data.unit?.label || null,
        }
        setInvoice(fetchedInvoice)
        setLeasePaidUntil(payload.data?.lease?.rent_paid_until || null)
        return fetchedInvoice
      }

      if (intent === 'rent') {
        const rentResponse = await fetch('/api/tenant/rent-invoice', { cache: 'no-store' })
        const rentPayload = await rentResponse.json().catch(() => ({}))
        if (!rentResponse.ok || !rentPayload.success) {
          throw new Error(rentPayload.error || 'Failed to prepare rent invoice.')
        }
        const rentInvoice = rentPayload.data?.invoice
        if (!rentInvoice) {
          throw new Error('Rent invoice data is missing.')
        }
        const rentInvoiceData: InvoiceSummary = {
          id: rentInvoice.id,
          amount: Number(rentInvoice.amount),
          status: rentInvoice.status,
          invoice_type: rentInvoice.invoice_type,
          description: rentInvoice.description,
          due_date: rentInvoice.due_date,
          property_name: rentInvoice.property_name,
          property_location: rentInvoice.property_location,
          unit_label: rentInvoice.unit_label,
        }
        setInvoice(rentInvoiceData)
        setMonthsToPay(1)
        setLeasePaidUntil(rentInvoice.lease?.rent_paid_until || null)
        return rentInvoiceData
      }

      const invoicesResp = await fetch('/api/tenant/invoices?status=pending', { cache: 'no-store' })
      const invoicesPayload = await invoicesResp.json().catch(() => ({}))
      if (!invoicesResp.ok) {
        throw new Error(invoicesPayload.error || 'Failed to load invoices.')
      }
      const list = invoicesPayload.data || []
      let target = list.find((item: any) => (intent === 'rent' ? item.invoice_type === 'rent' : false))
      if (!target) {
        target = list[0]
      }
      if (!target) {
        throw new Error('You have no pending invoices right now.')
      }
      const selectedInvoice: InvoiceSummary = {
        id: target.id,
        amount: Number(target.amount),
        status: target.status,
        invoice_type: target.invoice_type,
        description: target.description,
        due_date: target.due_date,
        property_name: target.property_name,
        property_location: target.property_location,
        unit_label: target.unit_label,
      }
      setInvoice(selectedInvoice)
      setLeasePaidUntil(target?.lease_paid_until || null)
      return selectedInvoice
    } catch (error) {
      setInvoice(null)
      setInvoiceError(error instanceof Error ? error.message : 'Unable to load invoice.')
      return null
    } finally {
      setLoadingInvoice(false)
    }
  }, [searchParams])

  useEffect(() => {
    fetchInvoice()
  }, [fetchInvoice])

  useEffect(() => {
    if (!mpesaPollPaymentId) {
      if (mpesaPollIntervalRef.current) {
        clearInterval(mpesaPollIntervalRef.current)
        mpesaPollIntervalRef.current = null
      }
      return
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/payments/mpesa/status/${mpesaPollPaymentId}`, {
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to fetch payment status.')
        }
        const status = payload.data?.status
        const message = payload.data?.message

        if (status === 'success') {
          setSecurityModalStatus('success')
          setSecurityModalMessage(message || 'Payment confirmed.')
          setMpesaMessage(message || null)
          setMpesaPollPaymentId(null)
          await fetchInvoice()
        } else if (status === 'failed') {
          setSecurityModalStatus('error')
          setSecurityModalMessage(message || 'Payment failed. Please try again.')
          setMpesaPollPaymentId(null)
        } else {
          setSecurityModalStatus('prompt')
          setSecurityModalMessage(message || 'Awaiting confirmation from Safaricom…')
        }
      } catch (error) {
        console.error('[MpesaStatusPoll] Failed to fetch status', error)
      }
    }

    pollStatus()
    mpesaPollIntervalRef.current = setInterval(pollStatus, 5000)

    return () => {
      if (mpesaPollIntervalRef.current) {
        clearInterval(mpesaPollIntervalRef.current)
        mpesaPollIntervalRef.current = null
      }
      if (depositPreviewUrl) {
        URL.revokeObjectURL(depositPreviewUrl)
      }
    }
  }, [mpesaPollPaymentId, fetchInvoice, depositPreviewUrl])

  const handleDepositUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setDepositSnapshot(file)
      if (depositPreviewUrl) URL.revokeObjectURL(depositPreviewUrl)
      setDepositPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
    }
  }

  const handleMpesaPayment = async () => {
    if (!mpesaNumber.trim()) {
      toast({
        title: 'Phone number required',
        description: 'Enter the M-Pesa phone number to receive the STK push.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSubmitting(true)
      setMpesaMessage(null)
      setSecurityModalStatus('prompt')
      setSecurityModalMessage('Enter your M-Pesa PIN on your phone to continue.')
      setSecurityModalOpen(true)
      const refreshedInvoice = await fetchInvoice()
      const currentInvoice = refreshedInvoice || invoice
      if (!currentInvoice || !currentInvoice.id) {
        setSecurityModalStatus('error')
        setSecurityModalMessage('Unable to locate your rent invoice. Please refresh and try again.')
        toast({
          title: 'Invoice missing',
          description: 'Unable to locate the rent invoice. Please refresh the page and try again.',
          variant: 'destructive',
        })
        return
      }
      const response = await fetch('/api/payments/mpesa/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: currentInvoice.id,
          amount: totalAmount,
          phone_number: mpesaNumber,
          months_covered: monthsToPay,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to initiate payment.')
      }
      const checkoutId = payload?.data?.checkout_request_id
      if (checkoutId) {
        console.log('[mpesa] checkout_request_id', checkoutId)
      }
      const paymentId = payload?.data?.payment_id
      if (paymentId) {
        setMpesaPollPaymentId(paymentId)
      }

      const toastDescription = checkoutId
        ? `${payload.message || 'STK push initiated successfully.'} Checkout ID: ${checkoutId}`
        : payload.message || 'STK push initiated successfully. Approve the prompt on your phone.'
      setMpesaMessage(toastDescription)
      setSecurityModalStatus('prompt')
      setSecurityModalMessage('Awaiting confirmation from Safaricom…')
      toast({
        title: 'STK push sent',
        description: toastDescription,
      })
    } catch (error) {
      setSecurityModalStatus('error')
      setSecurityModalMessage(
        error instanceof Error ? error.message : 'Unable to initiate M-Pesa payment. Please try again.'
      )
      setMpesaPollPaymentId(null)
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Unable to initiate M-Pesa payment.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleBankPayment = async () => {
    if (!invoice) return
    if (!depositSnapshot) {
      toast({
        title: 'Deposit slip required',
        description: 'Upload the deposit slip before submitting.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSubmitting(true)
      setBankMessage(null)
      const formData = new FormData()
      formData.append('invoice_id', invoice.id)
      formData.append('amount', String(totalAmount))
      formData.append('payment_method', 'bank_transfer')
      formData.append('months_paid', String(monthsToPay))
      if (bankReference) {
        formData.append('bank_reference_number', bankReference)
      }
      if (depositNotes) {
        formData.append('notes', depositNotes)
      }
      formData.append('deposit_slip', depositSnapshot)

      const response = await fetch('/api/payments/verify', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to submit deposit slip.')
      }
      setBankMessage('Deposit slip submitted. Management will review shortly.')
      toast({
        title: 'Deposit submitted',
        description: 'We will review and verify your payment soon.',
      })
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unable to submit deposit slip.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCardPayment = async () => {
    if (!invoice) return
    if (!cardDetails.name || !cardDetails.number || !cardDetails.expiry || !cardDetails.cvv) {
      toast({
        title: 'Card details required',
        description: 'Fill in the card holder, number, expiry, and CVV.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSubmitting(true)
      setCardMessage(null)
      const response = await fetch('/api/payments/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          amount: totalAmount,
          months_covered: monthsToPay,
          card_name: cardDetails.name,
          card_number: cardDetails.number,
          card_expiry: cardDetails.expiry,
          card_cvv: cardDetails.cvv,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to process card payment.')
      }
      setCardMessage(payload.message || 'Card payment recorded successfully.')
      toast({
        title: 'Payment complete',
        description: payload.message || 'Your rent payment has been saved.',
      })
      await fetchInvoice()
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Unable to process card payment.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = () => {
    if (!invoice || invoice.status) {
      toast({
        title: 'Invoice already paid',
        description: 'This invoice has been marked as paid.',
      })
      return
    }

    if (paymentMethod === 'mpesa') {
      handleMpesaPayment()
    } else if (paymentMethod === 'bank') {
      handleBankPayment()
    } else {
      handleCardPayment()
    }
  }

  if (loadingInvoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 via-white to-white">
        <div className="w-full max-w-5xl px-4 space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 shadow-xl">
            <div className="grid md:grid-cols-2 gap-4">
              <SkeletonLoader height={24} width="60%" />
              <SkeletonLoader height={14} width="70%" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SkeletonLoader height={36} />
              <SkeletonLoader height={36} />
            </div>
          </div>
          <Card className="shadow-md border-blue-100">
            <CardHeader>
              <SkeletonLoader height={20} width="30%" />
              <SkeletonLoader height={14} width="50%" />
            </CardHeader>
            <CardContent className="space-y-4">
              <SkeletonLoader height={32} width="40%" />
              <SkeletonLoader height={14} width="60%" />
              <SkeletonLoader height={48} rounded="rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (invoiceError || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50/30 via-white to-white">
        <div className="max-w-md w-full space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{invoiceError || 'No invoice available.'}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push('/dashboard/tenant')} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  const isInvoicePaid = Boolean(invoice.status)
  const modalAccent =
    securityModalStatus === 'success'
      ? 'text-emerald-600'
      : securityModalStatus === 'error'
        ? 'text-red-600'
        : 'text-blue-600'
  const ModalIcon =
    securityModalStatus === 'success' ? CheckCircle2 : securityModalStatus === 'error' ? AlertCircle : Smartphone

  return (
    <div className="min-h-screen bg-slate-950/5 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <ShieldCheck className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-emerald-200">Secure Rent Portal</p>
                <h1 className="text-3xl font-semibold mt-1">Encrypted payment experience</h1>
                <p className="text-sm text-slate-200 mt-2">
                  All M-Pesa, card, and bank transfers are protected with bank-grade encryption and real-time fraud
                  monitoring.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/5 p-3 border border-white/10">
                <p className="text-xs text-slate-300">Environment</p>
                <p className="font-semibold flex items-center gap-1">
                  <Lock className="h-4 w-4" /> Multi-factor protected
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3 border border-white/10">
                <p className="text-xs text-slate-300">Coverage</p>
                <p className="font-semibold">{leasePaidUntil ? `Paid through ${new Date(leasePaidUntil).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : 'Current month due'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Invoice #{invoice.id.slice(0, 8)}</p>
            <h2 className="text-3xl font-bold">{paymentTitle}</h2>
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
                <p className="text-xs uppercase text-muted-foreground">Total amount due</p>
                <p className="text-4xl font-semibold text-[#4682B4]">{formattedAmount}</p>
              </div>
                <div className="space-y-3 text-sm">
                <div className="flex justify-between border rounded-xl px-4 py-3 bg-blue-50/60">
                  <span className="text-muted-foreground">Property</span>
                  <span className="font-medium">{invoice.property_name || '—'}</span>
                </div>
                <div className="flex justify-between border rounded-xl px-4 py-3">
                  <span className="text-muted-foreground">Unit</span>
                  <span className="font-medium">{invoice.unit_label || '—'}</span>
                </div>
                <div className="flex justify-between border rounded-xl px-4 py-3">
                  <span className="text-muted-foreground">Billing period</span>
                  <span className="font-medium">
                    {invoice.due_date
                      ? new Date(invoice.due_date).toLocaleDateString(undefined, {
                          month: 'long',
                          year: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
                {showMonthsSelection && (
                  <div className="space-y-2">
                    <Label htmlFor="months-select">Months to pay</Label>
                    <select
                      id="months-select"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={monthsToPay}
                      onChange={(event) => setMonthsToPay(Number(event.target.value))}
                      disabled={isInvoicePaid}
                    >
                      {Array.from({ length: 12 }).map((_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1} {index + 1 === 1 ? 'Month' : 'Months'}
                        </option>
                      ))}
                    </select>
                    {coverageLabel && (
                      <p className="text-xs text-muted-foreground">
                        Covers rent through <span className="font-medium text-emerald-600">{coverageLabel}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
              <Alert className="bg-slate-50 border-slate-200">
                <AlertDescription className="text-xs text-muted-foreground">
                  Choose your preferred payment option below. Successful payments appear immediately in your account and on the manager dashboard.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="space-y-1">
              <CardTitle>Payment method</CardTitle>
              <CardDescription>Select Mpesa, card, or bank deposit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'mpesa' | 'card' | 'bank')} className="space-y-3">
                <div className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition ${paymentMethod === 'mpesa' ? 'border-green-500 bg-green-50/70' : 'border-muted'}`}>
                  <RadioGroupItem value="mpesa" id="mpesa" />
                  <Label htmlFor="mpesa" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-semibold">M-Pesa (STK push)</p>
                        <p className="text-xs text-muted-foreground">Receive a prompt on your phone.</p>
                      </div>
                    </div>
                  </Label>
                </div>
                <div className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50/70' : 'border-muted'}`}>
                  <RadioGroupItem value="card" id="card" />
                  <Label htmlFor="card" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-semibold">Visa / Mastercard</p>
                        <p className="text-xs text-muted-foreground">Charge your card instantly.</p>
                      </div>
                    </div>
                  </Label>
                </div>
                <div className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition ${paymentMethod === 'bank' ? 'border-amber-500 bg-amber-50/70' : 'border-muted'}`}>
                  <RadioGroupItem value="bank" id="bank" />
                  <Label htmlFor="bank" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <UploadCloud className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-semibold">Bank transfer</p>
                        <p className="text-xs text-muted-foreground">Upload the slip for manual verification.</p>
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>

              {paymentMethod === 'mpesa' && (
                <div className="space-y-4 rounded-2xl border bg-green-50/60 p-4">
                  <div>
                    <h3 className="text-sm font-semibold">M-Pesa instructions</h3>
                    <p className="text-xs text-muted-foreground">
                      {showMonthsSelection
                        ? `We will send an STK push to your phone for ${monthsToPay} ${monthsToPay === 1 ? 'month' : 'months'} of rent.`
                        : 'We will send an STK push to your phone for this bill.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mpesa-number">M-Pesa phone number</Label>
                    <Input
                      id="mpesa-number"
                      placeholder="2547XXXXXXXX"
                      value={mpesaNumber}
                      onChange={(event) => setMpesaNumber(event.target.value)}
                    />
                  </div>
                  {mpesaMessage && <p className="text-xs text-green-700">{mpesaMessage}</p>}
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-4 rounded-2xl border bg-blue-50/60 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="card-name">Name on card</Label>
                    <Input
                      id="card-name"
                      placeholder="Jane Mburu"
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
                  {cardMessage && <p className="text-xs text-green-700">{cardMessage}</p>}
                </div>
              )}

              {paymentMethod === 'bank' && (
                <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Bank deposit instructions</h3>
                    <p className="text-xs text-muted-foreground">
                      Transfer to Equity Bank • Acc Name: RentMaster Ltd • Acc No: 0123456789 • Ref: {invoice.unit_label || 'UNIT'}-{invoice.id.slice(0, 6)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit-reference">Bank reference number</Label>
                    <Input
                      id="deposit-reference"
                      placeholder="BK123456"
                      value={bankReference}
                      onChange={(event) => setBankReference(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit-upload">Upload deposit slip</Label>
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 flex flex-col gap-3 items-start">
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={() => document.getElementById('deposit-upload')?.click()}>
                          Choose file
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Upload a clear photo or PDF of your bank deposit slip.
                        </p>
                      </div>
                      <Input
                        id="deposit-upload"
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleDepositUpload}
                      />
                      {depositSnapshot && (
                        <div className="w-full">
                          <p className="text-xs text-muted-foreground mb-2">Selected: {depositSnapshot.name}</p>
                          {depositPreviewUrl ? (
                            <img
                              src={depositPreviewUrl}
                              alt="Deposit slip preview"
                              className="max-h-64 rounded-lg border object-contain"
                            />
                          ) : (
                            <div className="text-xs text-muted-foreground">Preview unavailable (PDF selected).</div>
                          )}
                        </div>
                      )}
                    </div>
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
                  {bankMessage && <p className="text-xs text-green-700">{bankMessage}</p>}
                </div>
              )}

              <Button onClick={handleSubmit} disabled={submitting || isInvoicePaid} className="w-full gap-2 bg-[#4682B4] hover:bg-[#3b6c99]">
                <CheckCircle2 className="h-5 w-5" />
                {isInvoicePaid ? 'Invoice already paid' : submitting ? 'Processing…' : 'Confirm payment option'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={securityModalOpen} onOpenChange={(open) => (!submitting ? setSecurityModalOpen(open) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ModalIcon className={`${modalAccent} h-5 w-5`} />
              {securityModalStatus === 'success'
                ? 'Payment initiated securely'
                : securityModalStatus === 'error'
                  ? 'Payment could not start'
                  : 'Secure confirmation required'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {securityModalStatus === 'success'
                ? 'We will confirm your payment automatically once Safaricom sends the confirmation.'
                : securityModalStatus === 'error'
                  ? 'Please review the message below and try again.'
                  : 'Confirm the STK prompt on your phone to continue.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{securityModalMessage}</p>
            <p className="text-xs text-muted-foreground">
              Keep this window open while we secure your transaction. You can close it once you’re done.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSecurityModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
