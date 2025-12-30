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
  building_id: string | null
  building_name: string | null
  building_location: string | null
}

type Building = {
  id: string
  name: string
  location: string | null
}

function formatKES(value: number) {
  return `KES ${Math.round(value).toLocaleString()}`
}

export default function ArrearsPage() {
  const [rows, setRows] = useState<ArrearsRow[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [buildingId, setBuildingId] = useState<string>('all')
  const [minArrears, setMinArrears] = useState<string>('0')
  const [summary, setSummary] = useState<{
    active_tenants: number
    defaulters: number
    defaulters_pct: number
    total_arrears_amount: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sRes = await fetch('/api/dashboard/manager/defaulters-summary', { cache: 'no-store' })
        const sJson = await sRes.json()
        if (sRes.ok && sJson.success && mounted) setSummary(sJson.data)

        const bRes = await fetch('/api/manager/buildings', { cache: 'no-store' })
        const bJson = await bRes.json()
        if (bRes.ok && bJson.success && mounted) setBuildings(bJson.data || [])
      } catch (e) {
        // Summary/buildings are optional; keep silent if they fail.
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams()
        if (buildingId !== 'all') params.set('building_id', buildingId)
        const min = Number(minArrears || '0')
        if (Number.isFinite(min) && min > 0) params.set('min_arrears', String(min))
        const res = await fetch(`/api/finance/arrears?${params.toString()}`, { cache: 'no-store' })
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
  }, [buildingId, minArrears])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((r) => {
      const unit = (r.unit_number ?? '').toLowerCase()
      const name = (r.tenant_name ?? '').toLowerCase()
      const phone = (r.tenant_phone ?? '').toLowerCase()
      const building = (r.building_name ?? '').toLowerCase()
      return unit.includes(query) || name.includes(query) || phone.includes(query) || building.includes(query)
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

      <div className="flex gap-3 flex-wrap items-center">
        <div className="w-full sm:w-72">
          <select
            className="w-full border rounded-md h-10 px-3 text-sm bg-white"
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
          >
            <option value="all">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-56">
          <Input
            placeholder="Min arrears (KES)"
            value={minArrears}
            onChange={(e) => setMinArrears(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          onClick={() => {
            setBuildingId('all')
            setMinArrears('0')
            setQ('')
          }}
        >
          Reset
        </Button>
      </div>

      {summary && (
        <Card>
          <CardContent className="p-6 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">Active tenants</p>
              <p className="text-xl font-bold">{summary.active_tenants}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Defaulters</p>
              <p className="text-xl font-bold">{summary.defaulters}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Defaulters rate</p>
              <p className="text-xl font-bold">{summary.defaulters_pct}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total arrears</p>
              <p className="text-xl font-bold">{formatKES(summary.total_arrears_amount || 0)}</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <th className="py-2 pr-4">Building</th>
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
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.building_name ?? '-'}</div>
                      {r.building_location && (
                        <div className="text-xs text-muted-foreground">{r.building_location}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">{r.tenant_name ?? '-'}</td>
                    <td className="py-2 pr-4">{r.tenant_phone ?? '-'}</td>
                    <td className="py-2 pr-4 font-semibold">{formatKES(r.arrears_amount || 0)}</td>
                    <td className="py-2 pr-4">{r.oldest_due_date ?? '-'}</td>
                    <td className="py-2 pr-4">{r.open_invoices_count ?? 0}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        {r.tenant_user_id ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/dashboard/tenants/${r.tenant_user_id}/lease`}>
                              View Lease
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            View Lease
                          </Button>
                        )}
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
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
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
