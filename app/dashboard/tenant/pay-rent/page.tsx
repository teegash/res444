'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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

type LeaseInfo = {
    id: string
    monthly_rent: number
    unit_number: string | null
    property_name: string | null
    property_location: string | null
    unit_label: string | null
    rent_paid_until: string | null
}

export default function PayRentPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [lease, setLease] = useState<LeaseInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card' | 'bank'>('mpesa')
    const [monthsToPay, setMonthsToPay] = useState(1)
    const [mpesaNumber, setMpesaNumber] = useState('')
    const [cardDetails, setCardDetails] = useState({ name: '', number: '', expiry: '', cvv: '' })
    const [depositSnapshot, setDepositSnapshot] = useState<File | null>(null)
    const [depositNotes, setDepositNotes] = useState('')
    const [bankReference, setBankReference] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [invoice, setInvoice] = useState<any>(null)
    const [mpesaMessage, setMpesaMessage] = useState<string | null>(null)
    const [bankMessage, setBankMessage] = useState<string | null>(null)
    const [cardMessage, setCardMessage] = useState<string | null>(null)

    // Calculate amounts
    const monthlyRent = lease?.monthly_rent || 0
    const totalAmount = monthlyRent * monthsToPay

    const formattedAmount = useMemo(
        () => `KES ${totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        [totalAmount]
    )

    const coverageLabel = useMemo(() => {
        if (!lease?.rent_paid_until) return null
        const paidUntil = new Date(lease.rent_paid_until)
        const coverage = new Date(paidUntil)
        coverage.setMonth(coverage.getMonth() + monthsToPay)
        return coverage.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    }, [lease?.rent_paid_until, monthsToPay])

    const fetchLeaseInfo = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            // Fetch tenant summary to get lease info
            const response = await fetch('/api/tenant/summary', { cache: 'no-store' })
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload.error || 'Failed to load lease info.')
            }
            const payload = await response.json()
            const leaseData = payload.data?.lease

            if (!leaseData) {
                throw new Error('No active lease found.')
            }

            setLease(leaseData)
        } catch (err) {
            console.error('[PayRent] Failed to fetch lease info:', err)
            setError(err instanceof Error ? err.message : 'Unable to load lease information.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchLeaseInfo()
    }, [fetchLeaseInfo])

    const createInvoiceAndProcess = useCallback(async (paymentMethod: string) => {
        if (!lease) return

        try {
            // First create the invoice
            const createRes = await fetch('/api/payments/pay-rent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ months_covered: monthsToPay }),
            })

            if (!createRes.ok) {
                throw new Error('Failed to create rent invoice')
            }

            const created = await createRes.json()
            const newInvoice = created.data?.invoice

            if (!newInvoice) {
                throw new Error('Created invoice missing')
            }

            setInvoice(newInvoice)

            // Then process the payment based on method
            if (paymentMethod === 'mpesa') {
                await handleMpesaPayment(newInvoice.id)
            } else if (paymentMethod === 'card') {
                await handleCardPayment(newInvoice.id)
            } else if (paymentMethod === 'bank') {
                await handleBankPayment(newInvoice.id)
            }
        } catch (err) {
            console.error('[PayRent] Failed to process payment:', err)
            toast({
                title: 'Payment failed',
                description: err instanceof Error ? err.message : 'Unable to process payment.',
                variant: 'destructive',
            })
            setSubmitting(false)
        }
    }, [lease, monthsToPay, toast])

    const handleMpesaPayment = async (invoiceId: string) => {
        if (!mpesaNumber.trim()) {
            toast({
                title: 'Phone number required',
                description: 'Enter the M-Pesa phone number to receive the STK push.',
                variant: 'destructive',
            })
            setSubmitting(false)
            return
        }

        try {
            setMpesaMessage(null)
            const response = await fetch('/api/payments/mpesa/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoice_id: invoiceId,
                    amount: totalAmount,
                    phone_number: mpesaNumber,
                    months_covered: monthsToPay,
                }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload.error || 'Failed to initiate payment.')
            }
            setMpesaMessage(payload.message || 'STK push initiated successfully. Approve the prompt on your phone.')
            toast({
                title: 'STK push sent',
                description: payload.message || 'Approve the prompt on your phone to complete payment.',
            })
            setSubmitting(false)
        } catch (error) {
            toast({
                title: 'Payment failed',
                description: error instanceof Error ? error.message : 'Unable to initiate M-Pesa payment.',
                variant: 'destructive',
            })
            setSubmitting(false)
        }
    }

    const handleBankPayment = async (invoiceId: string) => {
        if (!depositSnapshot) {
            toast({
                title: 'Deposit slip required',
                description: 'Upload the deposit slip before submitting.',
                variant: 'destructive',
            })
            setSubmitting(false)
            return
        }

        try {
            setBankMessage(null)
            const formData = new FormData()
            formData.append('invoice_id', invoiceId)
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
            setSubmitting(false)
        } catch (error) {
            toast({
                title: 'Upload failed',
                description: error instanceof Error ? error.message : 'Unable to submit deposit slip.',
                variant: 'destructive',
            })
            setSubmitting(false)
        }
    }

    const handleCardPayment = async (invoiceId: string) => {
        if (!cardDetails.name || !cardDetails.number || !cardDetails.expiry || !cardDetails.cvv) {
            toast({
                title: 'Card details required',
                description: 'Fill in the card holder, number, expiry, and CVV.',
                variant: 'destructive',
            })
            setSubmitting(false)
            return
        }

        try {
            setCardMessage(null)
            const response = await fetch('/api/payments/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoice_id: invoiceId,
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
            setSubmitting(false)
        } catch (error) {
            toast({
                title: 'Payment failed',
                description: error instanceof Error ? error.message : 'Unable to process card payment.',
                variant: 'destructive',
            })
            setSubmitting(false)
        }
    }

    const handleDepositUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            setDepositSnapshot(file)
        }
    }

    const handleSubmit = () => {
        if (!lease) return

        setSubmitting(true)
        createInvoiceAndProcess(paymentMethod)
    }

    const handleMpesaOnly = () => {
        if (!lease || !mpesaNumber.trim()) {
            toast({
                title: 'Phone number required',
                description: 'Enter the M-Pesa phone number to receive the STK push.',
                variant: 'destructive',
            })
            return
        }
        setSubmitting(true)
        createInvoiceAndProcess('mpesa')
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 via-white to-white">
                <div className="text-muted-foreground text-sm">Loading rent information…</div>
            </div>
        )
    }

    if (error || !lease) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50/30 via-white to-white">
                <div className="max-w-md w-full space-y-4">
                    <Alert variant="destructive">
                        <AlertDescription>{error || 'Unable to load lease information.'}</AlertDescription>
                    </Alert>
                    <Button onClick={() => router.push('/dashboard/tenant')} variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back to dashboard
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white py-10">
            <div className="max-w-5xl mx-auto px-4 space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/tenant')} className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back to dashboard
                    </Button>
                    <div>
                        <p className="text-xs text-muted-foreground">Pay Rent</p>
                        <h1 className="text-3xl font-bold">Pay Your Rent</h1>
                    </div>
                    <Badge className="ml-auto bg-blue-100 text-blue-700">
                        Monthly Rent Payment
                    </Badge>
                </div>

                <div className="grid lg:grid-cols-[2fr,3fr] gap-6">
                    {/* Rent Summary */}
                    <Card className="shadow-md border-blue-100">
                        <CardHeader>
                            <CardTitle>Rent Summary</CardTitle>
                            <CardDescription>Review your rent details and select payment period.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-xs uppercase text-muted-foreground">Monthly Rent</p>
                                <p className="text-4xl font-semibold text-[#4682B4]">
                                    KES {monthlyRent.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between border rounded-xl px-4 py-3 bg-blue-50/60">
                                    <span className="text-muted-foreground">Property</span>
                                    <span className="font-medium">{lease.property_name || '—'}</span>
                                </div>
                                <div className="flex justify-between border rounded-xl px-4 py-3">
                                    <span className="text-muted-foreground">Unit</span>
                                    <span className="font-medium">{lease.unit_label || lease.unit_number || '—'}</span>
                                </div>
                                <div className="flex justify-between border rounded-xl px-4 py-3">
                                    <span className="text-muted-foreground">Location</span>
                                    <span className="font-medium">{lease.property_location || '—'}</span>
                                </div>
                                {lease.rent_paid_until && (
                                    <div className="flex justify-between border rounded-xl px-4 py-3 bg-emerald-50/60">
                                        <span className="text-muted-foreground">Paid Until</span>
                                        <span className="font-medium text-emerald-700">
                                            {new Date(lease.rent_paid_until).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="months-select">Months to pay</Label>
                                    <select
                                        id="months-select"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        value={monthsToPay}
                                        onChange={(event) => setMonthsToPay(Number(event.target.value))}
                                    >
                                        {Array.from({ length: 12 }).map((_, index) => (
                                            <option key={index + 1} value={index + 1}>
                                                {index + 1} {index + 1 === 1 ? 'Month' : 'Months'}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground">
                                        Total due: <span className="font-medium text-[#4682B4]">{formattedAmount}</span>
                                    </p>
                                </div>
                            </div>

                            <Alert className="bg-slate-50 border-slate-200">
                                <AlertDescription className="text-xs text-muted-foreground">
                                    Your rent payment will be processed immediately and your payment status will be updated.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>

                    {/* Payment Methods */}
                    <Card className="shadow-md">
                        <CardHeader className="space-y-1">
                            <CardTitle>Payment Method</CardTitle>
                            <CardDescription>Choose your preferred payment option.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Quick M-Pesa Option */}
                            <div className="space-y-4">
                                <div className="p-4 border-2 border-green-500 bg-green-50/70 rounded-xl">
                                    <div className="flex items-center gap-3 mb-3">
                                        <Smartphone className="h-6 w-6 text-green-600" />
                                        <div>
                                            <p className="font-semibold text-green-800">Quick M-Pesa Payment</p>
                                            <p className="text-xs text-green-600">Fastest way to pay</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <Label htmlFor="quick-mpesa-number">M-Pesa phone number</Label>
                                            <Input
                                                id="quick-mpesa-number"
                                                placeholder="2547XXXXXXXX"
                                                value={mpesaNumber}
                                                onChange={(event) => setMpesaNumber(event.target.value)}
                                                className="mt-1"
                                            />
                                        </div>
                                        <Button
                                            onClick={handleMpesaOnly}
                                            disabled={submitting || !mpesaNumber.trim()}
                                            className="w-full gap-2 bg-green-600 hover:bg-green-700"
                                        >
                                            <Smartphone className="h-4 w-4" />
                                            {submitting ? 'Processing…' : `Pay ${formattedAmount} via M-Pesa`}
                                        </Button>
                                    </div>
                                    {mpesaMessage && <p className="text-xs text-green-700 mt-2">{mpesaMessage}</p>}
                                </div>
                            </div>

                            {/* Other Payment Methods */}
                            <div className="space-y-4">
                                <div className="text-center text-sm text-muted-foreground">Or choose another payment method:</div>

                                <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'card' | 'bank')} className="space-y-3">
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
                                                Transfer to Equity Bank • Acc Name: RentMaster Ltd • Acc No: 0123456789 • Ref: {lease.unit_label || 'UNIT'}-{invoice?.id?.slice(0, 6) || 'NEW'}
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
                                        {bankMessage && <p className="text-xs text-green-700">{bankMessage}</p>}
                                    </div>
                                )}

                                {(paymentMethod === 'card' || paymentMethod === 'bank') && (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="w-full gap-2 bg-[#4682B4] hover:bg-[#3b6c99]"
                                    >
                                        <CheckCircle2 className="h-5 w-5" />
                                        {submitting ? 'Processing…' : `Pay ${formattedAmount}`}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
