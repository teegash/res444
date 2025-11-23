const parseDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const startOfMonthUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

const addMonthsUtc = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))

const endOfMonthFromStart = (start: Date) => {
  const cursor = new Date(start.getTime())
  cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  cursor.setUTCDate(0)
  return cursor
}

const formatIso = (date: Date) => date.toISOString().split('T')[0]

export function calculatePaidUntil(
  leasePaidUntil: string | null | undefined,
  invoiceDueDate: string | null | undefined,
  monthsPaid: number
): string | null {
  if (monthsPaid <= 0) {
    return leasePaidUntil || invoiceDueDate || null
  }

  const existing = parseDate(leasePaidUntil)
  const dueDate = parseDate(invoiceDueDate)

  const coverageStart = existing
    ? addMonthsUtc(startOfMonthUtc(existing), 1)
    : dueDate
      ? startOfMonthUtc(dueDate)
      : startOfMonthUtc(new Date())

  const coverageEnd = endOfMonthFromStart(addMonthsUtc(coverageStart, monthsPaid - 1))

  if (existing && existing > coverageEnd) {
    return formatIso(existing)
  }

  return formatIso(coverageEnd)
}

export function getCoverageRangeLabel(
  invoiceDueDate: string | null | undefined,
  monthsPaid?: number | null
): string | null {
  if (!invoiceDueDate || !monthsPaid || monthsPaid <= 0) {
    return null
  }

  const due = parseDate(invoiceDueDate)
  if (!due) return null

  const startMonth = startOfMonthUtc(due)
  const startLabel = startMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  if (monthsPaid === 1) {
    return startLabel
  }

  const endStart = addMonthsUtc(startMonth, monthsPaid - 1)
  const endLabel = endStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  if (startLabel === endLabel) {
    return `${startLabel} (${monthsPaid} months)`
  }

  return `${startLabel} - ${endLabel}`
}
