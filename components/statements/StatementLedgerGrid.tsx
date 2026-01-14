'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type StatementTransaction = {
  id: string
  kind: 'charge' | 'payment'
  payment_type: string
  payment_method: string | null
  status: string
  posted_at: string | null
  description: string
  reference: string | null
  amount: number
  balance_after?: number
  coverage_label?: string | null
}

export type LedgerQuickFilter = 'all' | 'invoices' | 'payments' | 'arrears'

export type LedgerSummary = {
  totalBilled: number
  totalPaid: number
  currentBalance: number
}

export type LedgerView = {
  filter: LedgerQuickFilter
  rows: StatementTransaction[]
  summary: LedgerSummary
}

function formatCurrency(value: number | null | undefined) {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return 'KES 0'
  return `KES ${Math.abs(v).toLocaleString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString()
}

function sortByPostedAtAsc(rows: StatementTransaction[]) {
  const toDateKey = (value?: string | null) => {
    if (!value) return ''
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
    if (match) return match[0]
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toISOString().slice(0, 10)
  }
  const toTimeKey = (value?: string | null) => {
    if (!value) return 0
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 0
    return parsed.getTime()
  }
  return [...rows].sort((a, b) => {
    const aDate = toDateKey(a.posted_at)
    const bDate = toDateKey(b.posted_at)
    if (aDate === bDate) {
      if (a.kind !== b.kind) return a.kind === 'charge' ? -1 : 1
      const aTime = toTimeKey(a.posted_at)
      const bTime = toTimeKey(b.posted_at)
      if (aTime !== bTime) return aTime - bTime
      return (a.id || '').localeCompare(b.id || '')
    }
    if (!aDate) return -1
    if (!bDate) return 1
    return aDate.localeCompare(bDate)
  })
}

function computeSummary(baseRows: StatementTransaction[]): LedgerSummary {
  const totalBilled = baseRows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0)
  const totalPaid = baseRows.filter((r) => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0)
  const last = baseRows.length ? baseRows[baseRows.length - 1] : null
  const currentBalance = Number(last?.balance_after ?? 0)
  return { totalBilled, totalPaid, currentBalance }
}

function filterArrearsSlice(baseRows: StatementTransaction[]) {
  if (!baseRows.length) return []
  const currentBalance = Number(baseRows[baseRows.length - 1]?.balance_after ?? 0)
  if (!(currentBalance > 0)) return []

  let lastNonPositiveIndex = -1
  for (let i = baseRows.length - 1; i >= 0; i -= 1) {
    const bal = Number(baseRows[i]?.balance_after ?? 0)
    if (bal <= 0) {
      lastNonPositiveIndex = i
      break
    }
  }

  const start = lastNonPositiveIndex + 1
  return baseRows.slice(Math.max(0, start))
}

export function StatementLedgerGrid(props: {
  transactions: StatementTransaction[]
  initialFilter?: LedgerQuickFilter
  onViewChange?: (view: LedgerView) => void
}) {
  const [filter, setFilter] = useState<LedgerQuickFilter>(props.initialFilter || 'all')
  const onViewChangeRef = useRef<typeof props.onViewChange>(props.onViewChange)

  useEffect(() => {
    onViewChangeRef.current = props.onViewChange
  }, [props.onViewChange])

  const baseRows = useMemo(() => sortByPostedAtAsc(props.transactions || []), [props.transactions])
  const summary = useMemo(() => computeSummary(baseRows), [baseRows])

  const rows = useMemo(() => {
    switch (filter) {
      case 'invoices':
        return baseRows.filter((r) => r.kind === 'charge')
      case 'payments':
        return baseRows.filter((r) => r.kind === 'payment')
      case 'arrears':
        return filterArrearsSlice(baseRows)
      case 'all':
      default:
        return baseRows
    }
  }, [baseRows, filter])

  useEffect(() => {
    onViewChangeRef.current?.({ filter, rows, summary })
  }, [filter, rows, summary])

  const pillBase =
    'px-3 py-1.5 rounded-full text-sm border transition-colors whitespace-nowrap'
  const activePill = 'bg-slate-900 text-white border-slate-900'
  const inactivePill = 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'

  const balanceClass =
    summary.currentBalance < 0 ? 'text-emerald-600' : summary.currentBalance > 0 ? 'text-red-600' : 'text-slate-900'

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-slate-500">Total billed</div>
          <div className="text-lg font-semibold">{formatCurrency(summary.totalBilled)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-slate-500">Total paid</div>
          <div className="text-lg font-semibold">{formatCurrency(summary.totalPaid)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-slate-500">Current balance</div>
          <div className={`text-lg font-semibold ${balanceClass}`}>{formatCurrency(summary.currentBalance)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          className={`${pillBase} ${filter === 'all' ? activePill : inactivePill}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`${pillBase} ${filter === 'invoices' ? activePill : inactivePill}`}
          onClick={() => setFilter('invoices')}
        >
          Only invoices
        </button>
        <button
          type="button"
          className={`${pillBase} ${filter === 'payments' ? activePill : inactivePill}`}
          onClick={() => setFilter('payments')}
        >
          Only payments
        </button>
        <button
          type="button"
          className={`${pillBase} ${filter === 'arrears' ? activePill : inactivePill}`}
          onClick={() => setFilter('arrears')}
        >
          Show arrears only
        </button>

        <div className="ml-auto text-xs text-slate-500">
          Rows: <span className="font-medium text-slate-700">{rows.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-auto md:min-w-0 md:table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 font-semibold text-sm w-28">Date</th>
              <th className="text-left p-3 font-semibold text-sm w-28">Type</th>
              <th className="text-left p-3 font-semibold text-sm">Description</th>
              <th className="text-left p-3 font-semibold text-sm w-56">Reference</th>
              <th className="text-right p-3 font-semibold text-sm w-28">Debit</th>
              <th className="text-right p-3 font-semibold text-sm w-28">Credit</th>
              <th className="text-right p-3 font-semibold text-sm w-32">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  {filter === 'arrears' ? 'No arrears for this period.' : 'No rows to display.'}
                </td>
              </tr>
            ) : (
              rows.map((transaction) => {
                const isCredit = transaction.amount < 0
                const debit = !isCredit ? formatCurrency(transaction.amount) : '—'
                const credit = isCredit ? formatCurrency(Math.abs(transaction.amount)) : '—'
                const balanceRaw = Number(transaction.balance_after ?? 0)
                const balanceText = formatCurrency(balanceRaw)
                const balanceTone = balanceRaw < 0 ? 'text-emerald-600' : balanceRaw > 0 ? 'text-red-600' : 'text-slate-900'

                return (
                  <tr key={transaction.id} className="border-b last:border-0">
                    <td className="p-3 text-sm">{formatDate(transaction.posted_at)}</td>
                    <td className="p-3 text-sm capitalize">{transaction.payment_type || transaction.kind}</td>
                    <td className="p-3 text-sm">
                      <p>{transaction.description}</p>
                      {transaction.coverage_label ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Coverage: {transaction.coverage_label}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-sm font-mono text-slate-700 break-all leading-5">
                      {transaction.reference || '—'}
                    </td>
                    <td className="p-3 text-sm text-right text-slate-900">{debit}</td>
                    <td className="p-3 text-sm text-right text-emerald-600">{credit}</td>
                    <td className={`p-3 text-sm text-right font-semibold ${balanceTone}`}>{balanceText}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
