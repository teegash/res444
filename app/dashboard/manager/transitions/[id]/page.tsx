'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Download } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function TransitionDetailPage() {
  const params = useParams()
  const caseId = String((params as any)?.id || '')
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])

  const [status, setStatus] = useState('submitted')
  const [stage, setStage] = useState('opened')
  const [handoverDate, setHandoverDate] = useState('')
  const [inspectionNotes, setInspectionNotes] = useState('')
  const [damageCost, setDamageCost] = useState<string>('0')
  const [depositAmount, setDepositAmount] = useState<string>('0')
  const [depositDeductions, setDepositDeductions] = useState<string>('0')
  const [refundStatus, setRefundStatus] = useState<string>('not_applicable')
  const [notifyMessage, setNotifyMessage] = useState('')

  const signed = data?.signed_urls || {}

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
      setDamageCost(String(payload.case.damage_cost ?? 0))
      setDepositAmount(String(payload.case.deposit_amount ?? 0))
      setDepositDeductions(String(payload.case.deposit_deductions ?? 0))
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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className="p-6 space-y-6">
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
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">submitted</SelectItem>
                        <SelectItem value="acknowledged">acknowledged</SelectItem>
                        <SelectItem value="approved">approved</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                        <SelectItem value="completed">completed</SelectItem>
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
                    <Input value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} placeholder="YYYY-MM-DD" />
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
                    <Input value={damageCost} onChange={(e) => setDamageCost(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Deposit amount (KES)</div>
                    <Input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                    <div className="text-xs text-muted-foreground">Deposit deductions (KES)</div>
                    <Input value={depositDeductions} onChange={(e) => setDepositDeductions(e.target.value)} />
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
                    <div className="flex gap-2">
                      <Button onClick={saveUpdates} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save updates'}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => completeCase('vacant')}
                        disabled={completing}
                      >
                        {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete - Unit Vacant'}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => completeCase('maintenance')}
                        disabled={completing}
                      >
                        {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete - Unit Maintenance'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                          <span className="text-xs text-muted-foreground">{ev.created_at || ''}</span>
                        </div>
                        <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                          {JSON.stringify(ev.metadata || {}, null, 2)}
                        </pre>
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
