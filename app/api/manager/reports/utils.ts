export function getPeriodRange(period?: string) {
  const now = new Date()
  let start: Date | null = null
  let end: Date = now

  switch ((period || '').toLowerCase()) {
    case 'month':
      start = new Date(now)
      start.setMonth(start.getMonth() - 1)
      break
    case 'quarter':
      start = new Date(now)
      start.setMonth(start.getMonth() - 3)
      break
    case 'semi':
    case '6months':
      start = new Date(now)
      start.setMonth(start.getMonth() - 6)
      break
    case 'year':
      start = new Date(now)
      start.setFullYear(start.getFullYear() - 1)
      break
    case 'all':
    default:
      start = null
  }

  return {
    startDate: start ? start.toISOString().slice(0, 10) : null,
    endDate: end.toISOString().slice(0, 10),
  }
}

export function getPreviousPeriod(startDate: string | null, endDate: string) {
  if (!startDate) {
    return { prevStart: null, prevEnd: new Date(endDate).toISOString() }
  }
  const start = new Date(startDate)
  const end = new Date(endDate)
  const duration = end.getTime() - start.getTime()
  const prevEndDate = start
  const prevStartDate = new Date(start.getTime() - duration)
  return {
    prevStart: prevStartDate.toISOString().slice(0, 10),
    prevEnd: prevEndDate.toISOString().slice(0, 10),
  }
}

export function resolveRange(params: {
  period?: string | null
  startDate?: string | null
  endDate?: string | null
}) {
  const { period, startDate, endDate } = params
  if (startDate && endDate) return { start: startDate, end: endDate }
  const { startDate: s, endDate: e } = getPeriodRange(period || 'month')
  return { start: s || null, end: e }
}

export function defaultGroupBy(startIso: string | null, endIso: string): 'day' | 'week' | 'month' {
  if (!startIso) return 'month'
  const start = new Date(startIso)
  const end = new Date(endIso)
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000)

  if (diffDays <= 45) return 'day'
  if (diffDays <= 180) return 'week'
  return 'month'
}

export function safePct(n: number, d: number) {
  if (!d || d <= 0) return 0
  return (n / d) * 100
}

export function bucketKey(isoDate: string, groupBy: 'day' | 'week' | 'month') {
  const d = new Date(isoDate + 'T00:00:00Z')

  if (groupBy === 'day') return isoDate

  if (groupBy === 'month') {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().slice(0, 10)
}
