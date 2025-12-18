'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type PrepayRow = {
  organization_id: string
  lease_id: string
  tenant_user_id: string
  tenant_name: string | null
  tenant_phone: string | null
  unit_id: string | null
  unit_number: string | null
  rent_paid_until: string | null
  next_rent_due_date: string | null
  is_prepaid: boolean
}

function monthStartUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function monthsBetweenMonthStarts(fromMonthStart: Date, toMonthStart: Date) {
  return (
    (toMonthStart.getUTCFullYear() - fromMonthStart.getUTCFullYear()) * 12 +
    (toMonthStart.getUTCMonth() - fromMonthStart.getUTCMonth())
  )
}

function computePrepaidMonths(rentPaidUntil: string | null): number {
  if (!rentPaidUntil) return 0
  const paidUntil = new Date(`${rentPaidUntil}T00:00:00.000Z`)
  if (Number.isNaN(paidUntil.getTime())) return 0

  const currentMonthStart = monthStartUtc(new Date())
  if (paidUntil < currentMonthStart) return 0

  return Math.max(0, monthsBetweenMonthStarts(currentMonthStart, paidUntil) + 1)
}

export default function PrepaymentsPage() {
  const [rows, setRows] = useState<PrepayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [prepaidOnly, setPrepaidOnly] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/finance/prepayments', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load prepayments')
        if (mounted) setRows(json.data || [])
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load prepayments')
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
    return rows
      .filter((r) => (prepaidOnly ? r.is_prepaid === true : true))
      .filter((r) => {
        if (!query) return true
        const unit = (r.unit_number ?? '').toLowerCase()
        const name = (r.tenant_name ?? '').toLowerCase()
        const phone = (r.tenant_phone ?? '').toLowerCase()
        return unit.includes(query) || name.includes(query) || phone.includes(query)
      })
  }, [rows, q, prepaidOnly])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Prepayments</h1>
          <p className="text-sm text-muted-foreground">
            Monitor leases that are prepaid (rent_paid_until) and upcoming due dates.
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Input
            className="w-full sm:w-72"
            placeholder="Search unit, tenant, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            variant={prepaidOnly ? 'default' : 'outline'}
            onClick={() => setPrepaidOnly((v) => !v)}
          >
            {prepaidOnly ? 'Prepaid only' : 'Show all'}
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading prepayments…</CardContent>
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
            <CardTitle>Leases ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Paid Until</th>
                  <th className="py-2 pr-4">Months Prepaid</th>
                  <th className="py-2 pr-4">Next Due</th>
                  <th className="py-2 pr-4">Prepaid</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const prepaidMonths = computePrepaidMonths(r.rent_paid_until)
                  return (
                    <tr key={r.lease_id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium">{r.unit_number ?? '-'}</td>
                      <td className="py-2 pr-4">{r.tenant_name ?? '-'}</td>
                      <td className="py-2 pr-4">{r.tenant_phone ?? '-'}</td>
                      <td className="py-2 pr-4">{r.rent_paid_until ?? '-'}</td>
                      <td className="py-2 pr-4">{prepaidMonths || '-'}</td>
                      <td className="py-2 pr-4">{r.next_rent_due_date ?? '-'}</td>
                      <td className="py-2 pr-4">
                        {r.is_prepaid ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-800">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No rows to display.
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
