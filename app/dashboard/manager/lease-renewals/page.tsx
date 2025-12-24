'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCcw, Download, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

type RenewalRow = {
  id: string
  lease_id: string
  tenant_user_id: string
  status: string
  created_at: string | null
  tenant_signed_at: string | null
  manager_signed_at: string | null
  tenant_name?: string | null
  tenant_phone?: string | null
  property_name?: string | null
  property_location?: string | null
  unit_number?: string | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-KE')
}

export default function ManagerLeaseRenewalsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<RenewalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('all')
  const [workingId, setWorkingId] = useState<string | null>(null)

  const load = async (activeStatus: string) => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (activeStatus && activeStatus !== 'all') qs.set('status', activeStatus)
      const res = await fetch(`/api/manager/lease-renewals${qs.toString() ? `?${qs.toString()}` : ''}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load lease renewals.')
      }
      setRows(Array.isArray(payload.data) ? payload.data : [])
    } catch (err) {
      console.error('[ManagerLeaseRenewals] load failed', err)
      setRows([])
      toast({
        title: 'Unable to load renewals',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const countersign = async (renewalId: string) => {
    try {
      setWorkingId(renewalId)
      const res = await fetch(`/api/lease-renewals/${encodeURIComponent(renewalId)}/manager-sign`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to countersign renewal.')
      }
      toast({ title: 'Countersigned', description: 'The renewal is now fully signed and completed.' })
      await load(status)
    } catch (err) {
      toast({
        title: 'Countersign failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setWorkingId(null)
    }
  }

  const download = async (renewalId: string, which: 'unsignedUrl' | 'tenantSignedUrl' | 'fullySignedUrl') => {
    try {
      setWorkingId(renewalId)
      const res = await fetch(`/api/manager/lease-renewals/${encodeURIComponent(renewalId)}/links`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to get download link.')
      }
      const url = payload.data?.[which] as string | null
      if (!url) {
        throw new Error('Document not available for this status.')
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setWorkingId(null)
    }
  }

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1
    return byStatus
  }, [rows])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Lease Renewals</h1>
          <p className="text-sm text-muted-foreground">
            Tenant signing → management countersign → completed renewal PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent_to_tenant">Sent to tenant</SelectItem>
              <SelectItem value="tenant_signed">Tenant signed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(status)} disabled={loading}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Renewal envelopes</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${rows.length} record(s)`}{' '}
            {!loading && Object.keys(counts).length ? `• ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' • ')}` : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading renewals…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No renewals found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-3 font-semibold">Tenant</th>
                    <th className="p-3 font-semibold">Property</th>
                    <th className="p-3 font-semibold">Unit</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Created</th>
                    <th className="p-3 font-semibold">Tenant signed</th>
                    <th className="p-3 font-semibold">Manager signed</th>
                    <th className="p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const busy = workingId === r.id
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-medium">{r.tenant_name || 'Tenant'}</div>
                          <div className="text-xs text-muted-foreground">{r.tenant_phone || r.tenant_user_id}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{r.property_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.property_location || '—'}</div>
                        </td>
                        <td className="p-3">{r.unit_number || '—'}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-md border bg-white">
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3">{formatDate(r.created_at)}</td>
                        <td className="p-3">{formatDate(r.tenant_signed_at)}</td>
                        <td className="p-3">{formatDate(r.manager_signed_at)}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => download(r.id, 'unsignedUrl')}
                              disabled={busy}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Unsigned
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => download(r.id, 'tenantSignedUrl')}
                              disabled={busy}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Tenant
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => download(r.id, 'fullySignedUrl')}
                              disabled={busy}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Final
                            </Button>

                            {r.status === 'tenant_signed' ? (
                              <Button size="sm" onClick={() => countersign(r.id)} disabled={busy}>
                                <PenLine className="h-4 w-4 mr-2" />
                                {busy ? 'Working…' : 'Countersign'}
                              </Button>
                            ) : (
                              <Link href={`/dashboard/tenants/${encodeURIComponent(r.tenant_user_id)}/lease`}>
                                <Button size="sm" variant="ghost">
                                  View tenant
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

