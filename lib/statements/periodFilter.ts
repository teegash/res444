import type { StatementTransaction } from './statementPayload'

export type StatementPeriodFilter = 'month' | '3months' | '6months' | 'year' | 'all'

function toUtcDateKey(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // Common Supabase forms:
  // - date: "2025-12-24"
  // - timestamp: "2025-12-24T10:12:33.000Z"
  // Keep only the calendar date in UTC to avoid client timezone shifts.
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  if (match?.[1]) return match[1]

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function getCutoffDate(filter: StatementPeriodFilter, now = new Date()) {
  if (filter === 'all') return null
  // Midnight UTC (calendar-day based) to keep filtering consistent across client timezones.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (filter === 'month') cutoff.setUTCMonth(cutoff.getUTCMonth() - 1)
  if (filter === '3months') cutoff.setUTCMonth(cutoff.getUTCMonth() - 3)
  if (filter === '6months') cutoff.setUTCMonth(cutoff.getUTCMonth() - 6)
  if (filter === 'year') cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  return cutoff
}

export function getFilteredStatementView(
  transactions: StatementTransaction[],
  filter: StatementPeriodFilter,
  now = new Date()
) {
  const sorted = [...transactions].sort((a, b) => {
    const aKey = toUtcDateKey(a.posted_at)
    const bKey = toUtcDateKey(b.posted_at)
    const aTime = aKey ? Date.parse(`${aKey}T00:00:00.000Z`) : Number.POSITIVE_INFINITY
    const bTime = bKey ? Date.parse(`${bKey}T00:00:00.000Z`) : Number.POSITIVE_INFINITY
    return aTime - bTime
  })

  const cutoff = getCutoffDate(filter, now)
  const cutoffKey = cutoff ? cutoff.toISOString().slice(0, 10) : null
  const inRange = (txn: StatementTransaction) => {
    if (!cutoffKey) return true
    const postedKey = toUtcDateKey(txn.posted_at)
    if (!postedKey) return false
    return postedKey >= cutoffKey
  }

  const filteredTransactions = sorted.filter(inRange)

  const openingBalance =
    cutoffKey && sorted.length
      ? (() => {
          let lastBefore: StatementTransaction | null = null
          for (const txn of sorted) {
            const postedKey = toUtcDateKey(txn.posted_at)
            if (!postedKey) continue
            if (postedKey < cutoffKey) {
              lastBefore = txn
              continue
            }
            break
          }
          return lastBefore?.balance_after ?? 0
        })()
      : 0

  const closingBalance =
    filteredTransactions.length > 0
      ? filteredTransactions[filteredTransactions.length - 1].balance_after ?? openingBalance
      : openingBalance

  const totalCharges = filteredTransactions
    .filter((txn) => txn.amount > 0)
    .reduce((sum, txn) => sum + txn.amount, 0)

  const totalPayments = filteredTransactions
    .filter((txn) => txn.amount < 0)
    .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)

  const periodStart = filteredTransactions.length ? filteredTransactions[0].posted_at : null
  const periodEnd = filteredTransactions.length
    ? filteredTransactions[filteredTransactions.length - 1].posted_at
    : null

  return {
    cutoff,
    transactions: filteredTransactions,
    period: { start: periodStart, end: periodEnd },
    summary: {
      openingBalance,
      closingBalance,
      totalCharges,
      totalPayments,
    },
  }
}
