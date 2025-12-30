'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Download } from 'lucide-react'

export default function TenantTransitionPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-6 space-y-6 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
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
            <Card>
              <CardHeader>
                <CardTitle>
                  Unit {data.unit?.unit_number || '—'} • {data.unit?.building?.name || 'Property'}
                </CardTitle>
                <CardDescription>
                  Status: <Badge variant="secondary">{data.status}</Badge> • Stage:{' '}
                  <Badge variant="outline">{data.stage}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>Expected vacate date: <span className="font-medium">{data.expected_vacate_date || '—'}</span></div>
                <div>Handover date: <span className="font-medium">{data.handover_date || '—'}</span></div>

                <div className="pt-2">
                  {signed.notice_document_url ? (
                    <a className="inline-flex items-center gap-2 underline" href={signed.notice_document_url} target="_blank">
                      <Download className="h-4 w-4" /> Notice document
                    </a>
                  ) : null}
                </div>

                {data.refund_status && data.refund_status !== 'not_applicable' ? (
                  <div className="pt-2 border-t">
                    <div>Refund status: <span className="font-medium">{data.refund_status}</span></div>
                    <div>Refund amount: <span className="font-medium">KES {(Number(data.deposit_refund_amount || 0)).toLocaleString()}</span></div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Updates posted by management as the move-out process progresses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(events || []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No updates yet.</div>
                ) : (
                  events.map((ev: any) => (
                    <div key={ev.id} className="text-sm border rounded p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{ev.action}</span>
                        <span className="text-xs text-muted-foreground">{ev.created_at || ''}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
