'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ArrearsRow = {
  organization_id: string
  lease_id: string
  tenant_user_id: string
  tenant_name: string | null
  tenant_phone: string | null
  unit_id: string | null
  unit_number: string | null
  arrears_amount: number
  open_invoices_count: number
  oldest_due_date: string | null
}

function formatKES(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

export default function ArrearsPage() {
  const [rows, setRows] = useState<ArrearsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/finance/arrears', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load arrears')
        if (mounted) setRows(json.data || [])
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load arrears')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((r) => {
      const unit = (r.unit_number ?? '').toLowerCase()
      const name = (r.tenant_name ?? '').toLowerCase()
      const phone = (r.tenant_phone ?? '').toLowerCase()
      return unit.includes(query) || name.includes(query) || phone.includes(query)
    })
  }, [rows, q])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Rent Arrears</h1>
          <p className="text-sm text-muted-foreground">
            Rent-only arrears computed from unpaid/overdue rent invoices (verified payments only).
          </p>
        </div>

        <div className="w-full sm:w-96">
          <Input
            placeholder="Search unit, tenant, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading arrears…</CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>
              Leases in arrears ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Arrears</th>
                  <th className="py-2 pr-4">Oldest Due</th>
                  <th className="py-2 pr-4">Open Invoices</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.lease_id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{r.unit_number ?? '-'}</td>
                    <td className="py-2 pr-4">{r.tenant_name ?? '-'}</td>
                    <td className="py-2 pr-4">{r.tenant_phone ?? '-'}</td>
                    <td className="py-2 pr-4 font-semibold">{formatKES(r.arrears_amount || 0)}</td>
                    <td className="py-2 pr-4">{r.oldest_due_date ?? '-'}</td>
                    <td className="py-2 pr-4">{r.open_invoices_count ?? 0}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/properties/${r.lease_id}`}>
                            View Lease
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/payments?lease_id=${r.lease_id}&type=rent&status=unpaid`}>
                            View Invoices
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No rent arrears found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
