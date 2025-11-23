'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Droplet, Send, Calculator, Loader2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import jsPDF from 'jspdf'
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'
import { Badge } from '@/components/ui/badge'

interface TenantSummary {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

interface UnitSummary {
  id: string
  unit_number: string | null
  status: string | null
  tenant: TenantSummary | null
  latest_reading: number | null
}

interface PropertySummary {
  id: string
  name: string | null
  location: string | null
  units: UnitSummary[]
}

export default function WaterBillsPage() {
  const { toast } = useToast()
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('85')
  const [properties, setProperties] = useState<PropertySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [invoiceSent, setInvoiceSent] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [history, setHistory] = useState<
    Array<{
      id: string
      tenant_name: string | null
      unit_number: string | null
      property_name: string | null
      amount: number
      billing_month: string | null
      invoice_due_date: string | null
      created_at: string | null
      status: 'paid' | 'unpaid'
    }>
  >([])

  const resetForm = () => {
    setSelectedProperty('')
    setSelectedUnit('')
    setPreviousReading('')
    setCurrentReading('')
    setPricePerUnit('85')
    setNotes('')
    setInvoiceSent(false)
  }

  useEffect(() => {
    const fetchFormData = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/water-bills/form-data', { cache: 'no-store' })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Failed to load data.')
        }
        const payload = await response.json()
        setProperties(payload.data?.properties || [])
        setPricePerUnit(
          payload.data?.default_rate ? payload.data.default_rate.toString() : pricePerUnit
        )
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Unable to load form data.')
      } finally {
        setLoading(false)
      }
    }

    const fetchHistory = async () => {
      try {
        setHistoryLoading(true)
        setHistoryError(null)
        const response = await fetch('/api/water-bills/statement', { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load payment history.')
        }
        const records: any[] = payload.data || []
        const paidOrRecent = records
          .filter((r) => r.status === 'paid')
          .sort((a, b) => {
            const aDate = new Date(a.created_at || a.invoice_due_date || a.billing_month || 0).getTime()
            const bDate = new Date(b.created_at || b.invoice_due_date || b.billing_month || 0).getTime()
            return bDate - aDate
          })
          .slice(0, 6)

        setHistory(
          paidOrRecent.map((r) => ({
            id: r.id,
            tenant_name: r.tenant_name || null,
            unit_number: r.unit_number || null,
            property_name: r.property_name || null,
            amount: Number(r.amount || 0),
            billing_month: r.billing_month,
            invoice_due_date: r.invoice_due_date,
            created_at: r.created_at,
            status: r.status,
          }))
        )
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Unable to load payment history.')
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchFormData()
    fetchHistory()
  }, [])

  const availableUnits = useMemo(() => {
    return properties.find((property) => property.id === selectedProperty)?.units || []
  }, [properties, selectedProperty])

  const selectedPropertyData = useMemo(
    () => properties.find((property) => property.id === selectedProperty) || null,
    [properties, selectedProperty]
  )

  const selectedUnitData = selectedUnit
    ? availableUnits.find((unit) => unit.id === selectedUnit) || null
    : null

  const unitsConsumed =
    currentReading && previousReading
      ? Math.max(0, parseFloat(currentReading) - parseFloat(previousReading))
      : 0

  const totalAmount = unitsConsumed * parseFloat(pricePerUnit || '0')

  const handleUnitChange = (unitId: string) => {
    setSelectedUnit(unitId)
    const unit = availableUnits.find((u) => u.id === unitId)
    if (unit?.latest_reading !== null && !Number.isNaN(unit.latest_reading)) {
      setPreviousReading(unit.latest_reading.toString())
    } else {
      setPreviousReading('')
    }
  }

  const handleSendInvoice = async () => {
    if (!selectedUnitData) {
      toast({
        title: 'Select a tenant',
        description: 'Choose a property and unit to send an invoice.',
        variant: 'destructive',
      })
      return
    }
    if (!selectedUnitData.tenant?.phone) {
      toast({
        title: 'Missing phone number',
        description: 'This tenant does not have a phone number on file.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSendingInvoice(true)
      const dueDate = computeDueDate()
      const response = await fetch('/api/water-bills/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProperty,
          unitId: selectedUnitData.id,
          propertyName: selectedPropertyData?.name,
          unitNumber: selectedUnitData.unit_number,
          tenantName: selectedUnitData.tenant?.name,
          tenantPhone: selectedUnitData.tenant?.phone,
          tenantUserId: selectedUnitData.tenant?.id,
          unitsConsumed,
          pricePerUnit: Number(pricePerUnit),
          totalAmount,
          previousReading,
          currentReading,
          notes,
          dueDate,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to send invoice.')
      }

      setInvoiceSent(true)
    } catch (err) {
      toast({
        title: 'Unable to send invoice',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSendingInvoice(false)
    }
  }

  const computeDueDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().split('T')[0]
  }

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(num)) return 'KES 0.00'
    return `KES ${num.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const handleDownloadPdf = async () => {
    if (!selectedUnitData) {
      toast({
        title: 'Select a tenant',
        description: 'Choose a property and unit to export.',
        variant: 'destructive',
      })
      return
    }

    try {
      setDownloading(true)
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()

      const headerHeight = 110
      doc.setFillColor(37, 99, 235)
      doc.rect(0, 0, pageWidth, headerHeight, 'F')

      doc.setTextColor('#ffffff')
      doc.setFontSize(24)
      doc.text('Water Consumption Invoice', 48, 60)
      doc.setFontSize(11)
      doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 48, 82)
      doc.text(`Due Date: ${computeDueDate()}`, 48, 98)

      const summaryRows = [
        { label: 'Property', value: selectedPropertyData?.name || '—' },
        { label: 'Unit', value: selectedUnitData.unit_number || '—' },
        { label: 'Tenant', value: selectedUnitData.tenant?.name || '—' },
        { label: 'Contact', value: selectedUnitData.tenant?.phone || '—' },
      ]

      doc.setFillColor(255, 255, 255)
      doc.roundedRect(40, headerHeight + 10, pageWidth - 80, 120, 12, 12, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(40, headerHeight + 10, pageWidth - 80, 120, 12, 12, 'S')
      doc.setFontSize(12)
      doc.setTextColor('#0f172a')
      summaryRows.forEach((item, index) => {
        const x = 60 + (index % 2) * ((pageWidth - 120) / 2)
        const y = headerHeight + 38 + Math.floor(index / 2) * 28
        doc.setTextColor('#94a3b8')
        doc.text(item.label, x, y)
        doc.setTextColor('#0f172a')
        doc.setFont('helvetica', 'bold')
        doc.text(item.value, x, y + 15, { maxWidth: (pageWidth - 160) / 2 })
        doc.setFont('helvetica', 'normal')
      })

      let cursorY = headerHeight + 160
      const addSection = (title: string, rows: Array<{ label: string; value: string }>) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.setTextColor('#0f172a')
        doc.text(title, 48, cursorY)
        cursorY += 12
        doc.setDrawColor(226, 232, 240)
        doc.line(48, cursorY, pageWidth - 48, cursorY)
        cursorY += 18
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        rows.forEach((row) => {
          if (cursorY > doc.internal.pageSize.getHeight() - 80) {
            doc.addPage()
            cursorY = 60
          }
          doc.setTextColor('#94a3b8')
          doc.text(row.label, 48, cursorY)
          doc.setTextColor('#0f172a')
          const wrapped = doc.splitTextToSize(row.value, pageWidth - 96)
          doc.text(wrapped, 48, cursorY + 14)
          cursorY += 18 + wrapped.length * 12
        })
        cursorY += 6
      }

      addSection('Meter Details', [
        { label: 'Previous Reading', value: previousReading || '—' },
        { label: 'Current Reading', value: currentReading || '—' },
        { label: 'Units Consumed', value: `${unitsConsumed.toFixed(2)} units` },
        { label: 'Rate per Unit', value: formatCurrency(pricePerUnit) },
      ])

      addSection('Charges', [
        { label: 'Total Due', value: formatCurrency(totalAmount) },
        { label: 'Notes', value: notes || 'No additional notes provided.' },
      ])

      doc.setFontSize(10)
      doc.setTextColor('#94a3b8')
      doc.text(
        'Thank you for staying current with your utilities • RentalKenya Utility Desk',
        48,
        doc.internal.pageSize.getHeight() - 30
      )

      doc.save(`water-invoice-${selectedUnitData.unit_number || selectedUnitData.id}-${Date.now()}.pdf`)
      setDownloading(false)
    } catch (error) {
      setDownloading(false)
      toast({
        title: 'Unable to generate PDF',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-8 overflow-auto">
            <div className="max-w-4xl">
              <Card>
                <CardContent className="space-y-6">
                  <SkeletonLoader height={22} width="40%" />
                  <SkeletonLoader height={12} width="60%" />
                  <div className="grid md:grid-cols-2 gap-4">
                    <SkeletonLoader height={48} rounded="rounded-lg" />
                    <SkeletonLoader height={48} rounded="rounded-lg" />
                  </div>
                  <SkeletonTable rows={4} columns={3} />
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Droplet className="h-6 w-6 text-[#4682B4]" />
                </div>
                <h1 className="text-3xl font-bold">Create Water Bill Invoice</h1>
              </div>
              <p className="text-muted-foreground">
                Generate and send water bill invoices to tenants
              </p>
            </div>
            <Button asChild variant="outline" className="w-full md:w-auto md:ml-auto">
              <Link href="/dashboard/water-bills/statements">View water bill statements</Link>
            </Button>
          </div>

          <div className="max-w-6xl grid lg:grid-cols-[2fr,1fr] gap-6">
            <div className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                {invoiceSent ? (
                  <Card>
                    <CardContent className="py-10 text-center space-y-4">
                      <Droplet className="mx-auto h-10 w-10 text-[#4682B4]" />
                      <h2 className="text-2xl font-bold">Invoice Sent Successfully</h2>
                      <p className="text-sm text-muted-foreground">
                        The tenant has received the SMS invoice. You can download the PDF for your records or send
                        another invoice.
                      </p>
                      <div className="flex justify-center gap-4">
                        <Button variant="outline" onClick={handleDownloadPdf}>
                          Download PDF
                        </Button>
                        <Button onClick={resetForm}>Send Another Invoice</Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-[#4682B4] to-[#5a9fd4] text-white pt-7 pb-6">
                      <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        Water Consumption Invoice Form
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      {/* Property and Unit Selection */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="property">Select Property *</Label>
                          <Select
                            value={selectedProperty}
                            onValueChange={(value) => {
                              setSelectedProperty(value)
                              setSelectedUnit('')
                              setPreviousReading('')
                              setCurrentReading('')
                            }}
                          >
                            <SelectTrigger id="property" className="h-12">
                              <SelectValue placeholder="Choose property" />
                            </SelectTrigger>
                            <SelectContent>
                              {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.name || 'Unnamed property'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="unit">Select Apartment Unit *</Label>
                          <Select value={selectedUnit} onValueChange={handleUnitChange} disabled={!selectedProperty}>
                            <SelectTrigger id="unit" className="h-12">
                              <SelectValue placeholder={selectedProperty ? 'Choose unit' : 'Select property first'} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableUnits.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  Unit {unit.unit_number || 'N/A'}
                                  {unit.tenant?.name ? ` • ${unit.tenant.name}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Tenant Details - Auto-filled */}
                      {selectedUnitData && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                          <h3 className="font-semibold text-[#4682B4] flex items-center gap-2">
                            Tenant Details (Auto-filled)
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Tenant Name</Label>
                              <div className="mt-1 p-3 bg-white border rounded-md font-medium">
                                {selectedUnitData.tenant?.name || 'Not assigned'}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Unit Number</Label>
                              <div className="mt-1 p-3 bg-white border rounded-md font-medium">
                                {selectedUnitData.unit_number || 'N/A'}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Email Address</Label>
                              <div className="mt-1 p-3 bg-white border rounded-md">
                                {selectedUnitData.tenant?.email || 'Not available'}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Phone Number</Label>
                              <div className="mt-1 p-3 bg-white border rounded-md">
                                {selectedUnitData.tenant?.phone || 'Not available'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Water Consumption Details */}
                      <div className="space-y-4">
                        <h3 className="font-semibold text-lg">Water Consumption Details</h3>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="previous">Previous Reading *</Label>
                            <Input
                              id="previous"
                              type="number"
                              placeholder="0"
                              value={previousReading}
                              onChange={(e) => setPreviousReading(e.target.value)}
                              className="h-12 text-lg"
                              disabled={!selectedUnit}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="current">Current Reading *</Label>
                            <Input
                              id="current"
                              type="number"
                              placeholder="0"
                              value={currentReading}
                              onChange={(e) => setCurrentReading(e.target.value)}
                              className="h-12 text-lg"
                              disabled={!selectedUnit}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="price">Price per Unit (KES) *</Label>
                            <Input
                              id="price"
                              type="number"
                              placeholder="85"
                              value={pricePerUnit}
                              onChange={(e) => setPricePerUnit(e.target.value)}
                              className="h-12 text-lg"
                              disabled={!selectedUnit}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="notes">Additional Notes (Optional)</Label>
                          <Textarea
                            id="notes"
                            placeholder="Add any additional notes or remarks for this invoice..."
                            rows={3}
                            disabled={!selectedUnit}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Calculation Summary */}
                      {selectedUnit && (
                        <div className="p-6 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-[#4682B4] rounded-lg space-y-3">
                          <h3 className="font-semibold text-lg text-[#4682B4]">Invoice Summary</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center py-2 border-b">
                              <span className="text-muted-foreground">Units Consumed:</span>
                              <span className="text-xl font-bold">{unitsConsumed.toFixed(2)} units</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                              <span className="text-muted-foreground">Rate per Unit:</span>
                              <span className="text-xl font-bold">KES {parseFloat(pricePerUnit || '0').toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-3">
                              <span className="text-lg font-semibold">Total Amount:</span>
                              <span className="text-3xl font-bold text-[#4682B4]">
                                KES {totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-4 pt-4">
                        <Button
                          className="flex-1 h-12 text-lg bg-[#4682B4] hover:bg-[#4682B4]/90"
                          disabled={!selectedUnit || !currentReading || !previousReading || unitsConsumed <= 0 || sendingInvoice}
                          onClick={handleSendInvoice}
                        >
                          {sendingInvoice ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Sending…
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-5 w-5" />
                              Send Invoice to Tenant
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-12 gap-2"
                          onClick={handleDownloadPdf}
                          disabled={!selectedUnit || !currentReading || !previousReading || unitsConsumed <= 0 || downloading}
                        >
                          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplet className="h-4 w-4" />}
                          Download PDF
                        </Button>
                        <Button
                          variant="outline"
                          className="h-12"
                          onClick={() => {
                            setSelectedProperty('')
                            setSelectedUnit('')
                            setPreviousReading('')
                            setCurrentReading('')
                            setPricePerUnit('85')
                            setNotes('')
                          }}
                        >
                          Clear Form
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

            </div>

            <div className="space-y-4">
              <Card className="w-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Recent water bill payments</CardTitle>
                  <p className="text-sm text-muted-foreground">Latest 6 payments recorded</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {historyLoading && (
                    <div className="space-y-3">
                      <SkeletonLoader height={18} width="70%" />
                      <SkeletonLoader height={18} width="60%" />
                      <SkeletonLoader height={18} width="80%" />
                      <SkeletonLoader height={18} width="75%" />
                      <SkeletonLoader height={18} width="68%" />
                      <SkeletonLoader height={18} width="66%" />
                    </div>
                  )}
                  {!historyLoading && historyError && (
                    <Alert variant="destructive">
                      <AlertDescription>{historyError}</AlertDescription>
                    </Alert>
                  )}
                  {!historyLoading && !historyError && history.length === 0 && (
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                  )}
                  {!historyLoading &&
                    !historyError &&
                    history.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between rounded-lg border bg-white p-3 shadow-sm"
                      >
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800">
                            {item.tenant_name || 'Tenant'} • {item.unit_number || 'Unit'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.property_name || 'Property'} •{' '}
                            {item.billing_month
                              ? new Date(item.billing_month).toLocaleDateString(undefined, {
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Due{' '}
                            {item.invoice_due_date
                              ? new Date(item.invoice_due_date).toLocaleDateString()
                              : '—'}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(item.amount)}
                          </div>
                          <Badge
                            className={
                              item.status === 'paid'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                : 'bg-orange-500 text-white hover:bg-orange-400'
                            }
                          >
                            {item.status === 'paid' ? 'Paid' : 'Unpaid'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
