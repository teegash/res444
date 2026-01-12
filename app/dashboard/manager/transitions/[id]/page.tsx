'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChronoSelect } from '@/components/ui/chrono-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Download, ArrowLeft, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function TransitionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const caseId = String((params as any)?.id || '')
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingComplete, setPendingComplete] = useState<'vacant' | 'maintenance' | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({})

  const [status, setStatus] = useState('submitted')
  const [stage, setStage] = useState('opened')
  const [handoverDate, setHandoverDate] = useState('')
  const [inspectionNotes, setInspectionNotes] = useState('')
  const [damageCost, setDamageCost] = useState<string>('')
  const [depositAmount, setDepositAmount] = useState<string>('')
  const [depositDeductions, setDepositDeductions] = useState<string>('')
  const [refundStatus, setRefundStatus] = useState<string>('not_applicable')
  const [notifyMessage, setNotifyMessage] = useState('')

  const signed = data?.signed_urls || {}
  const isCompleted = (data?.status || '').toLowerCase() === 'completed'

  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parseDateLocal = (value: string) => {
    const parts = value.split('-').map((v) => Number(v))
    if (parts.length !== 3) return undefined
    const [year, month, day] = parts
    if (!year || !month || !day) return undefined
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const broadcastVacateRefresh = useCallback(() => {
    if (typeof window === 'undefined') return
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('vacate_notice_refresh')
      channel.postMessage({ ts: Date.now() })
      channel.close()
    } else {
      try {
        localStorage.setItem('vacate_notice_refresh', String(Date.now()))
      } catch {
        // ignore storage errors
      }
    }
  }, [])

  const handoverDateValue = useMemo(() => {
    if (!handoverDate) return undefined
    return parseDateLocal(handoverDate)
  }, [handoverDate])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/tenant-transitions/${caseId}`, { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load case.')

      setData(payload.case)
      setEvents(payload.events || [])

      setStatus(payload.case.status || 'submitted')
      setStage(payload.case.stage || 'opened')
      setHandoverDate(payload.case.handover_date || '')
      setInspectionNotes(payload.case.inspection_notes || '')
      setDamageCost(payload.case.damage_cost ? String(payload.case.damage_cost) : '')
      setDepositAmount(payload.case.deposit_amount ? String(payload.case.deposit_amount) : '')
      setDepositDeductions(payload.case.deposit_deductions ? String(payload.case.deposit_deductions) : '')
      setRefundStatus(payload.case.refund_status || 'not_applicable')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (caseId) load()
  }, [caseId])

  const refundAmount = useMemo(() => {
    const a = Number(depositAmount || 0)
    const d = Number(depositDeductions || 0)
    return Math.max(a - d, 0)
  }, [depositAmount, depositDeductions])

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }))
  }

  const saveUpdates = async () => {
    try {
      setSaving(true)
      const res = await fetch(`/api/tenant-transitions/${caseId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          stage,
          handover_date: handoverDate || null,
          inspection_notes: inspectionNotes || null,
          damage_cost: Number(damageCost || 0),
          deposit_amount: Number(depositAmount || 0),
          deposit_deductions: Number(depositDeductions || 0),
          refund_status: refundStatus || null,
          notify_message: notifyMessage?.trim() || null,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to update case.')

      toast({ title: 'Saved', description: 'Transition case updated.' })
      setNotifyMessage('')
      await load()
      broadcastVacateRefresh()
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Failed to update case.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const completeCase = async (unitNextStatus: 'vacant' | 'maintenance') => {
    try {
      setCompleting(true)
      const res = await fetch(`/api/tenant-transitions/${caseId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_next_status: unitNextStatus,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to complete case.')
      toast({ title: 'Completed', description: 'Transition case marked completed.' })
      await load()
      broadcastVacateRefresh()
    } catch (e) {
      toast({
        title: 'Completion failed',
        description: e instanceof Error ? e.message : 'Failed to complete case.',
        variant: 'destructive',
      })
    } finally {
      setCompleting(false)
    }
  }

  const requestComplete = (unitNextStatus: 'vacant' | 'maintenance') => {
    setPendingComplete(unitNextStatus)
    setConfirmText('')
    setConfirmOpen(true)
  }

  const handleConfirmComplete = async () => {
    if (!pendingComplete) return
    const nextStatus = pendingComplete
    setConfirmOpen(false)
    setPendingComplete(null)
    setConfirmText('')
    await completeCase(nextStatus)
  }

  const confirmLabel =
    pendingComplete === 'vacant'
      ? 'Complete - Unit Vacant'
      : pendingComplete === 'maintenance'
      ? 'Complete - Unit Maintenance'
      : 'Complete transition'
  const confirmReady = confirmText.trim().toUpperCase() === 'CONFIRM'

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold mt-2">Tenant transitions</h1>
              <p className="text-sm text-muted-foreground">
                Manage handover, inspections, and deposit settlement.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !data ? (
            <div className="text-sm text-muted-foreground">Case not found.</div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {data.tenant?.full_name || 'Tenant'} • Unit {data.unit?.unit_number || '—'} •{' '}
                    {data.unit?.building?.name || 'Property'}
                  </CardTitle>
                  <CardDescription>
                    Status: <Badge variant="secondary">{data.status}</Badge> • Stage:{' '}
                    <Badge variant="outline">{data.stage}</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setStatus(value)
                        if (
                          value === 'completed' &&
                          stage !== 'unit_turned_over' &&
                          stage !== 'onboarded_new_tenant'
                        ) {
                          setStage('unit_turned_over')
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">submitted</SelectItem>
                        <SelectItem value="acknowledged">acknowledged</SelectItem>
                        <SelectItem value="approved">approved</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                        {isCompleted || status === 'completed' ? (
                          <SelectItem value="completed">completed</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Stage</div>
                    <Select value={stage} onValueChange={setStage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opened">opened</SelectItem>
                        <SelectItem value="handover_scheduled">handover_scheduled</SelectItem>
                        <SelectItem value="inspected">inspected</SelectItem>
                        <SelectItem value="deposit_settled">deposit_settled</SelectItem>
                        <SelectItem value="vacated">vacated</SelectItem>
                        <SelectItem value="unit_turned_over">unit_turned_over</SelectItem>
                        <SelectItem value="onboarded_new_tenant">onboarded_new_tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Handover date</div>
                    <ChronoSelect
                      value={handoverDateValue}
                      onChange={(date) =>
                        setHandoverDate(date ? formatDateLocal(date) : '')
                      }
                      placeholder="Select handover date"
                      className="w-full justify-start"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Signed links expire automatically; refresh the page if needed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {signed.notice_document_url ? (
                    <a className="inline-flex items-center gap-2 text-sm underline" href={signed.notice_document_url} target="_blank">
                      <Download className="h-4 w-4" /> Notice document
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">Notice document not available.</div>
                  )}

                  {signed.inspection_report_url ? (
                    <a className="inline-flex items-center gap-2 text-sm underline" href={signed.inspection_report_url} target="_blank">
                      <Download className="h-4 w-4" /> Inspection report
                    </a>
                  ) : null}

                  {signed.settlement_statement_url ? (
                    <a className="inline-flex items-center gap-2 text-sm underline" href={signed.settlement_statement_url} target="_blank">
                      <Download className="h-4 w-4" /> Settlement statement
                    </a>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inspection & Deposit Settlement</CardTitle>
                  <CardDescription>Record damages and deposit settlement; refund is computed.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Inspection notes</div>
                    <Textarea value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} rows={6} />
                    <div className="text-xs text-muted-foreground">Damage cost (KES)</div>
                    <Input
                      value={damageCost}
                      onChange={(e) => setDamageCost(e.target.value)}
                      placeholder="e.g. 2500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Deposit amount (KES)</div>
                    <Input
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="e.g. 10000"
                    />
                    <div className="text-xs text-muted-foreground">Deposit deductions (KES)</div>
                    <Input
                      value={depositDeductions}
                      onChange={(e) => setDepositDeductions(e.target.value)}
                      placeholder="e.g. 1500"
                    />
                    <div className="text-xs text-muted-foreground">Refund status</div>
                    <Select value={refundStatus} onValueChange={setRefundStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_applicable">not_applicable</SelectItem>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="paid">paid</SelectItem>
                        <SelectItem value="waived">waived</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="mt-2 text-sm">
                      Refund amount: <span className="font-semibold">KES {refundAmount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <div className="text-xs text-muted-foreground">Optional tenant notification message</div>
                    <Textarea
                      value={notifyMessage}
                      onChange={(e) => setNotifyMessage(e.target.value)}
                      placeholder="Example: Handover scheduled for 2026-01-15 at 10:00 AM. Please be present with keys."
                      rows={3}
                    />
                    {!isCompleted ? (
                      <div className="flex gap-2">
                        <Button onClick={saveUpdates} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save updates'}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => requestComplete('vacant')}
                          disabled={completing}
                        >
                          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete - Unit Vacant'}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => requestComplete('maintenance')}
                          disabled={completing}
                        >
                          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete - Unit Maintenance'}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        This transition case is completed. No further updates are allowed.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

                <AlertDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                  setConfirmOpen(open)
                  if (!open) {
                    setPendingComplete(null)
                    setConfirmText('')
                  }
                }}
              >
                <AlertDialogContent className="border-rose-200 bg-rose-50/95">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
                      <AlertTriangle className="h-5 w-5" />
                      Confirm completion
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-rose-700/90">
                      You are about to mark this transition as completed and update the unit status.
                      This action is not reversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="rounded-md border border-rose-200 bg-white/70 px-3 py-2 text-xs text-rose-700">
                    {confirmLabel}. Please confirm you want to continue.
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-rose-700">
                      Type CONFIRM to proceed
                    </label>
                    <Input
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder="CONFIRM"
                      className="border-rose-200 bg-white"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={completing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={handleConfirmComplete}
                      disabled={completing || !pendingComplete || !confirmReady}
                    >
                      {completing ? 'Completing...' : 'Yes, complete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>Audit events recorded for this case.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(events || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No events yet.</div>
                  ) : (
                    events.map((ev: any) => (
                      <div key={ev.id} className="text-sm border rounded p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{ev.action}</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-700"
                              onClick={() => toggleEvent(ev.id)}
                            >
                              {expandedEvents[ev.id] ? 'Hide details' : 'View details'}
                            </button>
                            <span className="text-xs text-muted-foreground">{ev.created_at || ''}</span>
                          </div>
                        </div>
                        {expandedEvents[ev.id] ? (
                          <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                            {JSON.stringify(ev.metadata || {}, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
