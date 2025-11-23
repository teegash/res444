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
    startDate: start ? start.toISOString() : null,
    endDate: end.toISOString(),
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
  return { prevStart: prevStartDate.toISOString(), prevEnd: prevEndDate.toISOString() }
}
