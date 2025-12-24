'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-KE')
}

export default function ManagerLeaseRenewalsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/manager/lease-renewals', { cache: 'no-store', credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load renewals.')
        if (!cancelled) setRows(Array.isArray(json.rows) ? json.rows : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load renewals.')
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Lease Renewals</h1>
          <p className="text-sm text-muted-foreground">Create envelopes, track tenant signing, countersign and download.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Renewal envelopes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading renewals…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No renewals found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="p-3 font-semibold">Renewal</th>
                    <th className="p-3 font-semibold">Lease</th>
                    <th className="p-3 font-semibold">Tenant</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Created</th>
                    <th className="p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{String(r.id).slice(0, 8)}</td>
                      <td className="p-3 font-mono text-xs">{String(r.lease_id).slice(0, 8)}</td>
                      <td className="p-3 font-mono text-xs">{String(r.tenant_user_id).slice(0, 8)}</td>
                      <td className="p-3">{r.status}</td>
                      <td className="p-3">{formatDate(r.created_at)}</td>
                      <td className="p-3">
                        <Link href={`/dashboard/manager/lease-renewals/${encodeURIComponent(r.id)}`}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

