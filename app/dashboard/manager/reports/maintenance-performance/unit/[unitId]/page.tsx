'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Wrench } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type PerformanceRow = {
  property_id: string
  property_name: string
  unit_id: string
  unit_number: string
  year: number
  rent_collected: number
  maintenance_spend: number
  net_income: number
  maintenance_to_collections_ratio: number | null
}

type MaintenanceRequest = {
  id: string
  title: string
  description: string
  priority_level: string
  status: string
  created_at: string | null
  completed_at: string | null
  maintenance_cost: number
  maintenance_cost_paid_by: string
  maintenance_cost_notes: string | null
  assigned_technician_name: string | null
  assigned_technician_phone: string | null
  tenant: { full_name: string | null; phone_number: string | null } | null
  attachment_urls: string[]
}

type UnitDetailPayload = {
  unit: { id: string; unit_number: string; building: { id: string; name: string | null; location?: string | null } | null }
  range: { start: string; end: string }
  requests: MaintenanceRequest[]
}

const fmtKES = (value: number) => `KES ${Math.round(value).toLocaleString()}`
const fmtPct = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`

export default function UnitMaintenancePerformancePage() {
  const router = useRouter()
  const params = useParams<{ unitId: string }>()
  const searchParams = useSearchParams()

  const unitId = params?.unitId ? decodeURIComponent(params.unitId) : ''
  const propertyId = searchParams.get('propertyId') || ''
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const year = searchParams.get('year') || String(new Date().getFullYear())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [performance, setPerformance] = useState<PerformanceRow | null>(null)
  const [detail, setDetail] = useState<UnitDetailPayload | null>(null)

  const rangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} to ${endDate}`
    return `Year ${year}`
  }, [startDate, endDate, year])

  const computeFlag = (row: PerformanceRow) => {
    if ((row.rent_collected || 0) <= 0) return { text: 'No collections', variant: 'secondary' as const }
    const ratio = row.maintenance_to_collections_ratio
    if (ratio != null && ratio >= 0.2) return { text: 'High spend', variant: 'destructive' as const }
    if (ratio != null && ratio >= 0.1) return { text: 'Watch', variant: 'default' as const }
    return null
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        if (!unitId) throw new Error('Unit id is required.')

        const qs = new URLSearchParams()
        qs.set('unitId', unitId)
        if (propertyId) qs.set('propertyId', propertyId)
        if (startDate && endDate) {
          qs.set('startDate', startDate)
          qs.set('endDate', endDate)
        } else {
          qs.set('year', year)
        }

        const detailQs = new URLSearchParams()
        detailQs.set('unitId', unitId)
        if (startDate && endDate) {
          detailQs.set('startDate', startDate)
          detailQs.set('endDate', endDate)
        } else {
          detailQs.set('year', year)
        }

        const [performanceRes, detailRes] = await Promise.all([
          fetch(`/api/manager/reports/unit-maintenance-performance?${qs.toString()}`, { cache: 'no-store' }),
          fetch(`/api/manager/reports/unit-maintenance-detail?${detailQs.toString()}`, { cache: 'no-store' }),
        ])

        const perfJson = await performanceRes.json().catch(() => ({}))
        const detailJson = await detailRes.json().catch(() => ({}))
        if (!performanceRes.ok || !perfJson?.success) {
          throw new Error(perfJson?.error || 'Failed to load unit performance.')
        }
        if (!detailRes.ok || !detailJson?.success) {
          throw new Error(detailJson?.error || 'Failed to load unit maintenance details.')
        }

        const perfRow = Array.isArray(perfJson.data) ? perfJson.data[0] : null
        if (active) {
          setPerformance(perfRow || null)
          setDetail(detailJson as UnitDetailPayload)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load unit details.')
          setPerformance(null)
          setDetail(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [unitId, propertyId, startDate, endDate, year])

  const flag = performance ? computeFlag(performance) : null
  const requests = detail?.requests || []

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs text-muted-foreground">Unit performance</p>
                <h1 className="text-2xl font-bold">
                  {detail?.unit?.building?.name || performance?.property_name || 'Property'} •{' '}
                  {detail?.unit?.unit_number || performance?.unit_number || 'Unit'}
                </h1>
                <p className="text-sm text-muted-foreground">{rangeLabel}</p>
              </div>
            </div>

            {loading ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading unit performance…
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border border-rose-200 bg-rose-50">
                <CardContent className="p-4 text-sm text-rose-700">{error}</CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-0 shadow-lg bg-white">
                  <CardHeader>
                    <CardTitle>Performance snapshot</CardTitle>
                    <CardDescription>Cash collections vs landlord maintenance spend.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Property</p>
                        <p className="text-base font-semibold">
                          {detail?.unit?.building?.name || performance?.property_name || 'Property'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Unit</p>
                        <p className="text-base font-semibold">{detail?.unit?.unit_number || performance?.unit_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">Flag</p>
                      {flag ? <Badge variant={flag.variant}>{flag.text}</Badge> : <span className="text-sm">—</span>}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Collected</p>
                        <p className="text-lg font-bold text-emerald-700">
                          {fmtKES(performance?.rent_collected || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Maintenance spend</p>
                        <p className="text-lg font-bold text-rose-700">
                          {fmtKES(performance?.maintenance_spend || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Net income</p>
                        <p className="text-lg font-bold">{fmtKES(performance?.net_income || 0)}</p>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Spend ratio</p>
                        <p className="text-lg font-bold text-blue-700">
                          {fmtPct(performance?.maintenance_to_collections_ratio ?? null)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-slate-50 p-3">
                      <p className="text-sm text-muted-foreground">Notes:</p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        <li>Collected is based on verified rent payments for the selected period.</li>
                        <li>Maintenance spend includes landlord-paid maintenance costs only.</li>
                        <li>Ratio is blank when collections are zero.</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-slate-600" />
                      Maintenance requests
                    </CardTitle>
                    <CardDescription>
                      {requests.length} requests for this unit in the selected period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {requests.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No maintenance requests found.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="py-2">Date</th>
                              <th className="py-2">Title</th>
                              <th className="py-2">Status</th>
                              <th className="py-2">Priority</th>
                              <th className="py-2">Cost</th>
                              <th className="py-2">Paid by</th>
                              <th className="py-2">Technician</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {requests.map((req) => (
                              <tr key={req.id} className="align-top">
                                <td className="py-3 pr-3 text-muted-foreground">
                                  {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
                                </td>
                                <td className="py-3 pr-3">
                                  <div className="font-medium text-slate-900">{req.title}</div>
                                  <div className="text-xs text-muted-foreground">{req.description}</div>
                                </td>
                                <td className="py-3 pr-3">
                                  <Badge variant={req.status === 'completed' ? 'default' : 'secondary'}>
                                    {req.status}
                                  </Badge>
                                </td>
                                <td className="py-3 pr-3 text-muted-foreground">{req.priority_level}</td>
                                <td className="py-3 pr-3 text-slate-900">{fmtKES(req.maintenance_cost || 0)}</td>
                                <td className="py-3 pr-3 text-muted-foreground">{req.maintenance_cost_paid_by}</td>
                                <td className="py-3 text-muted-foreground">
                                  {req.assigned_technician_name || '—'}
                                  {req.assigned_technician_phone ? ` • ${req.assigned_technician_phone}` : ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
