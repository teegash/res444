'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Smartphone, UploadCloud, ShieldCheck, AlertCircle } from 'lucide-react'
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

type PollState = {
  active: boolean
  attempts: number
  lastDelayMs: number
  startedAt: number | null
}

const MAX_POLL_ATTEMPTS = 12
const INITIAL_POLL_DELAY_MS = 5000
const MAX_POLL_DELAY_MS = 30000

function nextPollDelay(prev: number) {
  const next = Math.round(prev * 1.6)
  return Math.min(Math.max(next, INITIAL_POLL_DELAY_MS), MAX_POLL_DELAY_MS)
}

function isFinalStatus(status: string | null | undefined) {
  if (!status) return false
  const normalized = status.toLowerCase()
  return ['success', 'completed', 'failed', 'cancelled', 'canceled', 'timeout'].some((key) =>
    normalized.includes(key)
  )
}

export default function TenantPaymentPortal() {
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [loadingInvoice, setLoadingInvoice] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'bank'>('mpesa')
  const [monthsToPay, setMonthsToPay] = useState<number>(1)
  const [mpesaNumber, setMpesaNumber] = useState('')
  const [depositSnapshot, setDepositSnapshot] = useState<File | null>(null)
  const [depositPreviewUrl, setDepositPreviewUrl] = useState<string | null>(null)
  const [depositNotes, setDepositNotes] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mpesaMessage, setMpesaMessage] = useState<string | null>(null)
  const [bankMessage, setBankMessage] = useState<string | null>(null)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)
  const [securityModalStatus, setSecurityModalStatus] = useState<'prompt' | 'success' | 'error'>('prompt')
  const [securityModalMessage, setSecurityModalMessage] = useState(
    'We are securing your request. Approve the prompt on your phone.'
  )
  const [mpesaPollPaymentId, setMpesaPollPaymentId] = useState<string | null>(null)
  const [poll, setPoll] = useState<PollState>({
    active: false,
    attempts: 0,
    lastDelayMs: INITIAL_POLL_DELAY_MS,
    startedAt: null,
  })
  const pollRef = useRef<PollState>({
    active: false,
    attempts: 0,
    lastDelayMs: INITIAL_POLL_DELAY_MS,
    startedAt: null,
  })
  const mpesaPollTimerRef = useRef<number | null>(null)
  const runPollCycleRef = useRef<() => void>(() => {})

  const baseAmount = invoice ? invoice.amount : 0
  const totalAmount = baseAmount * monthsToPay

  const formattedAmount = useMemo(
    () => `KES ${totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [totalAmount]
  )

  const coverageLabel = useMemo(() => {
    if (!invoice?.due_date) return null
    const start = new Date(invoice.due_date)
    if (Number.isNaN(start.getTime())) return null
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (monthsToPay - 1), 1))
    return end.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  }, [invoice?.due_date, monthsToPay])

  const paymentTitle = invoice?.invoice_type === 'water' ? 'Pay Water Bill' : 'Pay Rent'
  const showMonthsSelection = invoice?.invoice_type !== 'water'

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

  const setPollState = useCallback((next: PollState) => {
    pollRef.current = next
    setPoll(next)
  }, [])

  const updatePollState = useCallback((updater: (prev: PollState) => PollState) => {
    setPoll((prev) => {
      const next = updater(prev)
      pollRef.current = next
      return next
    })
  }, [])

  const clearPollTimer = useCallback(() => {
    if (mpesaPollTimerRef.current !== null) {
      clearTimeout(mpesaPollTimerRef.current)
      mpesaPollTimerRef.current = null
    }
  }, [])

  const pollStatusOnce = useCallback(async (): Promise<string | null> => {
    if (!mpesaPollPaymentId) return null
    const response = await fetch(`/api/payments/mpesa/status/${mpesaPollPaymentId}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to fetch payment status.')
    }
    const status = payload.data?.status as string | null | undefined
    const message = payload.data?.message
    const normalized = status ? status.toLowerCase() : ''
    const isSuccess = normalized.includes('success') || normalized.includes('completed')
    const isFailure =
      normalized.includes('failed') ||
      normalized.includes('cancelled') ||
      normalized.includes('canceled') ||
      normalized.includes('timeout')

    if (isSuccess) {
      setSecurityModalStatus('success')
      setSecurityModalMessage(message || 'Payment confirmed.')
      setMpesaMessage(message || null)
      setMpesaPollPaymentId(null)
      await fetchInvoice()
    } else if (isFailure) {
      setSecurityModalStatus('error')
      setSecurityModalMessage(message || 'Payment failed. Please try again.')
      setMpesaPollPaymentId(null)
    } else {
      setSecurityModalStatus('prompt')
      setSecurityModalMessage(message || 'Awaiting confirmation from Safaricom…')
    }

    return status || null
  }, [mpesaPollPaymentId, fetchInvoice])

  const scheduleNextPoll = useCallback((delayMs: number) => {
    if (document.visibilityState === 'hidden') {
      return
    }
    mpesaPollTimerRef.current = window.setTimeout(() => {
      runPollCycleRef.current()
    }, delayMs)
  }, [])

  const runPollCycle = useCallback(async () => {
    let status: string | null = null
    try {
      status = await pollStatusOnce()
    } catch (error) {
      console.error('[MpesaStatusPoll] Failed to fetch status', error)
    }

    const prev = pollRef.current
    const attempts = prev.attempts + 1

    if (isFinalStatus(status)) {
      clearPollTimer()
      setPollState({ ...prev, attempts, active: false })
      return
    }

    if (attempts >= MAX_POLL_ATTEMPTS) {
      clearPollTimer()
      setPollState({ ...prev, attempts, active: false })
      return
    }

    const nextDelayMs = nextPollDelay(prev.lastDelayMs)
    setPollState({ ...prev, attempts, lastDelayMs: nextDelayMs, active: true })
    scheduleNextPoll(nextDelayMs)
  }, [pollStatusOnce, clearPollTimer, scheduleNextPoll, setPollState])

  useEffect(() => {
    runPollCycleRef.current = () => {
      void runPollCycle()
    }
  }, [runPollCycle])

  const startPolling = useCallback(() => {
    if (!mpesaPollPaymentId) return
    clearPollTimer()
    setPollState({
      active: true,
      attempts: 0,
      lastDelayMs: INITIAL_POLL_DELAY_MS,
      startedAt: Date.now(),
    })
    void runPollCycle()
  }, [mpesaPollPaymentId, clearPollTimer, setPollState, runPollCycle])

  const stopPolling = useCallback(() => {
    clearPollTimer()
    updatePollState((prev) => ({ ...prev, active: false }))
  }, [clearPollTimer, updatePollState])

  useEffect(() => {
    if (!mpesaPollPaymentId) {
      stopPolling()
      return
    }
    startPolling()
    return () => stopPolling()
  }, [mpesaPollPaymentId, startPolling, stopPolling])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (pollRef.current.active && mpesaPollPaymentId && mpesaPollTimerRef.current === null) {
          scheduleNextPoll(pollRef.current.lastDelayMs)
        }
        return
      }
      clearPollTimer()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [mpesaPollPaymentId, scheduleNextPoll, clearPollTimer])

  useEffect(() => {
    return () => {
      if (depositPreviewUrl) {
        URL.revokeObjectURL(depositPreviewUrl)
      }
    }
  }, [depositPreviewUrl])

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
      router.push('/dashboard/tenant')
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
    } else {
      handleBankPayment()
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
            <ArrowLeft className="h-4 w-4" /> Back
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
                  All M-Pesa and bank transfers are protected with bank-grade encryption and real-time fraud
                  monitoring.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
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
                      {[1, 2, 3].map((val) => (
                        <option key={val} value={val}>
                          {val} {val === 1 ? 'Month' : 'Months'}
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
              <CardDescription>Select Mpesa or bank deposit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'mpesa' | 'bank')} className="space-y-3">
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
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={startPolling}
                      disabled={!mpesaPollPaymentId}
                      className="h-8 px-3 text-xs"
                    >
                      {poll.active ? 'Checking...' : 'Refresh M-Pesa Status'}
                    </Button>
                    {poll.active && (
                      <span className="text-xs text-muted-foreground">
                        Checking status… Attempt {poll.attempts}/{MAX_POLL_ATTEMPTS}
                      </span>
                    )}
                  </div>
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
