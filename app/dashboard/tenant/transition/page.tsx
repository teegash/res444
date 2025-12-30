'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, DoorOpen, FileText, Loader2, Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function TenantTransitionPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({})

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/tenant/transitions', { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load transition.')

      setData(payload.case || null)
      setEvents(payload.events || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transition.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const signed = data?.signed_urls || {}

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const statusClasses = (value?: string | null) => {
    const status = String(value || '').toLowerCase()
    if (status === 'completed') return 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    if (status === 'approved') return 'bg-blue-100 text-blue-700 border border-blue-200'
    if (status === 'acknowledged') return 'bg-amber-100 text-amber-700 border border-amber-200'
    if (status === 'rejected' || status === 'cancelled') return 'bg-slate-200 text-slate-700 border border-slate-300'
    return 'bg-purple-100 text-purple-700 border border-purple-200'
  }

  const stageLabel = (value?: string | null) => String(value || 'opened').replace(/_/g, ' ')

  const stageClasses = (value?: string | null) => {
    const stage = String(value || '').toLowerCase()
    if (stage === 'handover_scheduled') return 'bg-sky-50 text-sky-700 border border-sky-200'
    if (stage === 'inspected') return 'bg-violet-50 text-violet-700 border border-violet-200'
    if (stage === 'deposit_settled') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    if (stage === 'vacated') return 'bg-amber-50 text-amber-700 border border-amber-200'
    if (stage === 'unit_turned_over') return 'bg-indigo-50 text-indigo-700 border border-indigo-200'
    if (stage === 'onboarded_new_tenant') return 'bg-teal-50 text-teal-700 border border-teal-200'
    return 'bg-slate-50 text-slate-600 border border-slate-200'
  }

  const refundPanel = useMemo(() => {
    const status = String(data?.refund_status || '').toLowerCase()
    if (!status || status === 'not_applicable') return null
    return {
      status,
      amount: Number(data?.deposit_refund_amount || 0),
      paid: status === 'paid',
    }
  }, [data])

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }))
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-3 md:hidden">
            <Link href="/dashboard/tenant">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <Link href="/dashboard/tenant/lease?tab=vacate_notice">
              <Button variant="secondary" size="sm" className="gap-2">
                <FileText className="h-4 w-4" />
                Vacate notice
              </Button>
            </Link>
          </div>

          <div className="flex items-start gap-3 md:flex-1 md:items-center">
            <Link href="/dashboard/tenant" className="hidden md:inline-flex">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <DoorOpen className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Tenant transitions</h1>
              <p className="text-sm text-muted-foreground">
                Track your move-out process, handover dates, and refund updates.
              </p>
            </div>
          </div>

          <Link href="/dashboard/tenant/lease?tab=vacate_notice" className="hidden md:inline-flex md:ml-auto">
            <Button variant="secondary" size="sm" className="gap-2">
              <FileText className="h-4 w-4" />
              Vacate notice
            </Button>
          </Link>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
          </Card>
        ) : !data ? (
          <Card>
            <CardHeader>
              <CardTitle>No move-out case</CardTitle>
              <CardDescription>
                If you submitted a vacate notice, management will open a move-out case once they begin processing it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/tenant/lease?tab=vacate_notice">
                <Button variant="outline">View your vacate notice</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border border-slate-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>
                  Unit {data.unit?.unit_number || '—'} • {data.unit?.building?.name || 'Property'}
                </CardTitle>
                <CardDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses(
                        data.status
                      )}`}
                    >
                      {String(data.status || 'submitted')}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${stageClasses(
                        data.stage
                      )}`}
                    >
                      {stageLabel(data.stage)}
                    </span>
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Expected vacate</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.expected_vacate_date)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Handover date</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.handover_date)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Actual vacate</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.actual_vacate_date)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Secure links provided by management.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {signed.notice_document_url ? (
                  <a className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700" href={signed.notice_document_url} target="_blank">
                    <Download className="h-4 w-4" /> Notice document
                  </a>
                ) : (
                  <div className="text-sm text-muted-foreground">Notice document not available.</div>
                )}

                {signed.inspection_report_url ? (
                  <a className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700" href={signed.inspection_report_url} target="_blank">
                    <Download className="h-4 w-4" /> Inspection report
                  </a>
                ) : null}

                {signed.settlement_statement_url ? (
                  <a className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700" href={signed.settlement_statement_url} target="_blank">
                    <Download className="h-4 w-4" /> Settlement statement
                  </a>
                ) : null}
              </CardContent>
            </Card>

            {refundPanel ? (
              <Card className="border border-slate-100 bg-white/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Deposit settlement</CardTitle>
                  <CardDescription>Summary of your refund status.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                  <div
                    className={`rounded-xl p-4 ${
                      refundPanel.paid ? 'bg-emerald-50' : 'bg-rose-50'
                    }`}
                  >
                    <p
                      className={`text-xs uppercase tracking-wide ${
                        refundPanel.paid ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      Refund status
                    </p>
                    <p
                      className={`mt-1 text-base font-semibold ${
                        refundPanel.paid ? 'text-emerald-900' : 'text-rose-900'
                      }`}
                    >
                      {refundPanel.status.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Refund amount</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      KES {refundPanel.amount.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border border-slate-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Updates posted by management as the move-out process progresses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(events || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No updates yet.</div>
                ) : (
                  events.map((ev: any) => (
                    <div key={ev.id} className="rounded-xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{String(ev.action || '').replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-3">
                          {ev.metadata ? (
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-700"
                              onClick={() => toggleEvent(ev.id)}
                            >
                              {expandedEvents[ev.id] ? 'Hide details' : 'View details'}
                            </button>
                          ) : null}
                          <span className="text-xs text-muted-foreground">{formatDate(ev.created_at)}</span>
                        </div>
                      </div>
                      {ev.metadata && expandedEvents[ev.id] ? (
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
      </div>
    </div>
  )
}
