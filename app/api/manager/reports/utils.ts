export function getPeriodRange(period?: string) {
  const now = new Date()
  let start: Date | null = null

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
    endDate: now.toISOString(),
  }
}
