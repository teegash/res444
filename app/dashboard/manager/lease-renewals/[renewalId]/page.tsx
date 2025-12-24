'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Download, Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-KE')
}

export default function ManagerLeaseRenewalDetailPage() {
  const params = useParams<{ renewalId: string }>()
  const renewalId = params.renewalId
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [renewal, setRenewal] = useState<any | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lease-renewals/${encodeURIComponent(renewalId)}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load renewal.')
      setRenewal(json.renewal || null)
      setEvents(Array.isArray(json.events) ? json.events : [])
    } catch (e) {
      setRenewal(null)
      setEvents([])
      setError(e instanceof Error ? e.message : 'Failed to load renewal.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!renewalId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewalId])

  const download = async (type: 'unsigned' | 'tenant_signed' | 'fully_signed') => {
    try {
      setWorking(true)
      const res = await fetch(
        `/api/lease-renewals/${encodeURIComponent(renewalId)}/download?type=${encodeURIComponent(type)}`,
        { cache: 'no-store', credentials: 'include' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to create download link.')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Unable to download.',
        variant: 'destructive',
      })
    } finally {
      setWorking(false)
    }
  }

  const countersign = async () => {
    try {
      setWorking(true)
      const res = await fetch(`/api/lease-renewals/${encodeURIComponent(renewalId)}/manager-sign`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Countersign failed.')
      toast({ title: 'Countersigned', description: 'Renewal completed.' })
      await load()
    } catch (e) {
      toast({
        title: 'Countersign failed',
        description: e instanceof Error ? e.message : 'Unable to countersign.',
        variant: 'destructive',
      })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Lease Renewal Detail</h1>
          <p className="text-sm text-muted-foreground">Tenant signs first, then management countersigns.</p>
        </div>
        <Link href="/dashboard/manager/lease-renewals">
          <Button variant="outline" size="sm">
            Back to renewals
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading renewal…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : !renewal ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Renewal not found.</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-semibold">{renewal.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tenant signed</div>
                  <div className="font-semibold">{formatDate(renewal.tenant_signed_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Manager signed</div>
                  <div className="font-semibold">{formatDate(renewal.manager_signed_at)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="outline" size="sm" onClick={() => download('unsigned')} disabled={working}>
                  <Download className="h-4 w-4 mr-2" />
                  Unsigned
                </Button>
                <Button variant="outline" size="sm" onClick={() => download('tenant_signed')} disabled={working}>
                  <Download className="h-4 w-4 mr-2" />
                  Tenant-signed
                </Button>
                <Button variant="outline" size="sm" onClick={() => download('fully_signed')} disabled={working}>
                  <Download className="h-4 w-4 mr-2" />
                  Fully signed
                </Button>
                {renewal.status === 'tenant_signed' ? (
                  <Button size="sm" onClick={countersign} disabled={working}>
                    <PenLine className="h-4 w-4 mr-2" />
                    Countersign
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {events.length === 0 ? (
                <div className="text-muted-foreground">No events recorded.</div>
              ) : (
                <ul className="space-y-2">
                  {events.map((e, idx) => (
                    <li key={`${e.action}-${idx}`} className="rounded-md border p-3 bg-white">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-semibold">{e.action}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(e.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

