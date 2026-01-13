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
  const vacateNotice = data?.vacate_notice || null
  const noticeDocUrl = signed.notice_document_url || signed.vacate_notice_url || null

  const formatDate = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const parseDateOnly = (value?: string | null) => {
    if (!value) return null
    const raw = String(value || '').trim()
    if (!raw) return null
    const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
    const [y, m, d] = base.split('-').map((part) => Number(part))
    if (y && m && d) {
      return new Date(Date.UTC(y, m - 1, d))
    }
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
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

  const vacateProgress = useMemo(() => {
    if (!vacateNotice || !vacateNotice.requested_vacate_date) return null
    const status = String(vacateNotice.status || '').toLowerCase()
    if (status === 'rejected') return null

    const end = parseDateOnly(vacateNotice.requested_vacate_date)
    const startRaw = vacateNotice.notice_submitted_at || vacateNotice.created_at || null
    const start = startRaw ? parseDateOnly(startRaw) : null
    if (!end) return null

    const safeStart = start || new Date()
    const startDay = new Date(Date.UTC(safeStart.getUTCFullYear(), safeStart.getUTCMonth(), safeStart.getUTCDate()))
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

    const totalMs = Math.max(1, endDay.getTime() - startDay.getTime())
    const today = new Date()
    const todayDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const elapsedMs = Math.min(Math.max(todayDay.getTime() - startDay.getTime(), 0), totalMs)
    const progress = status === 'completed' ? 1 : elapsedMs / totalMs
    const daysRemaining = Math.max(0, Math.ceil((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24)))
    const totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)))

    return {
      progress,
      daysRemaining,
      totalDays,
      endLabel: formatDate(vacateNotice.requested_vacate_date),
    }
  }, [vacateNotice])

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50">
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
          <Card className="border border-indigo-100/70 bg-white/90 shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border border-rose-100/70 bg-white/90 shadow-sm">
            <CardContent className="p-6 text-sm text-rose-600">{error}</CardContent>
          </Card>
        ) : !data ? (
          <Card className="border border-indigo-100/70 bg-white/95 shadow-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/60">
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
            <Card className="border border-indigo-100/70 bg-gradient-to-br from-white via-white to-indigo-50/40 shadow-[0_12px_30px_rgba(99,102,241,0.12)]">
              <CardHeader className="bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 rounded-t-xl">
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
                <div className="rounded-xl border border-indigo-100/70 bg-gradient-to-br from-indigo-50/70 to-white p-4">
                  <p className="text-xs uppercase tracking-wide text-indigo-500">Expected vacate</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.expected_vacate_date)}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50/70 to-white p-4">
                  <p className="text-xs uppercase tracking-wide text-sky-500">Handover date</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.handover_date)}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-100/80 bg-gradient-to-br from-amber-50/70 to-white p-4">
                  <p className="text-xs uppercase tracking-wide text-amber-600">Actual vacate</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formatDate(data.actual_vacate_date)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {vacateProgress ? (
              <Card className="border border-slate-200/80 bg-white/95 shadow-sm">
                <CardHeader className="bg-gradient-to-r from-slate-50 via-white to-slate-50 rounded-t-xl">
                  <CardTitle>Vacate notice progress</CardTitle>
                  <CardDescription>Countdown from notice submission to your requested vacate date.</CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const progressPct = Math.round(vacateProgress.progress * 100)
                    const progressColor =
                      progressPct <= 25
                        ? '#22c55e'
                        : progressPct <= 50
                          ? '#eab308'
                          : progressPct <= 75
                            ? '#f97316'
                            : '#ef4444'
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Submitted</span>
                          <span>{vacateProgress.endLabel}</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: progressColor,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>{progressPct}% complete</span>
                          <span>
                            {vacateProgress.daysRemaining} days left of {vacateProgress.totalDays}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            ) : null}

            <Card className="border border-emerald-100/70 bg-gradient-to-br from-white via-white to-emerald-50/30 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-emerald-50/70 via-white to-sky-50/60 rounded-t-xl">
                <CardTitle>Documents</CardTitle>
                <CardDescription>Secure links provided by management.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {noticeDocUrl ? (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                    href={noticeDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Download className="h-4 w-4" /> Notice document
                  </a>
                ) : (
                  <div className="text-sm text-muted-foreground">Notice document not available.</div>
                )}

                {signed.inspection_report_url ? (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-200/70 bg-sky-50/70 px-3 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
                    href={signed.inspection_report_url}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Download className="h-4 w-4" /> Inspection report
                  </a>
                ) : null}

                {signed.settlement_statement_url ? (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                    href={signed.settlement_statement_url}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Download className="h-4 w-4" /> Settlement statement
                  </a>
                ) : null}
              </CardContent>
            </Card>

            {refundPanel ? (
              <Card className="border border-rose-100/70 bg-gradient-to-br from-white via-white to-rose-50/30 shadow-sm">
                <CardHeader className="bg-gradient-to-r from-rose-50/70 via-white to-amber-50/60 rounded-t-xl">
                  <CardTitle>Deposit settlement</CardTitle>
                  <CardDescription>Summary of your refund status.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                  <div
                    className={`rounded-xl p-4 ${
                      refundPanel.paid ? 'bg-emerald-50 border border-emerald-100/80' : 'bg-rose-50 border border-rose-100/80'
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
                  <div className="rounded-xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/70 to-white p-4">
                    <p className="text-xs uppercase tracking-wide text-indigo-500">Refund amount</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      KES {refundPanel.amount.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border border-indigo-100/70 bg-white/95 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-indigo-50/60 via-white to-sky-50/60 rounded-t-xl">
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Updates posted by management as the move-out process progresses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(events || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No updates yet.</div>
                ) : (
                  events.map((ev: any) => (
                    <div key={ev.id} className="rounded-xl border border-indigo-100/70 bg-gradient-to-br from-white via-white to-indigo-50/30 p-4 shadow-sm">
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
