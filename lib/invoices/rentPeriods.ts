export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

export function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

export function addDaysUtc(date: Date, days: number): Date {
  const out = new Date(date)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

export function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function rentDueDateForPeriod(periodStart: Date): string {
  const dueDate = new Date(periodStart)
  dueDate.setUTCDate(5) // always 5th of the month
  return toIsoDate(dueDate)
}

export function waterPeriodStartForCreatedAt(createdAt: Date): Date {
  // Current month billing period
  return startOfMonthUtc(createdAt)
}

export function waterDueDateForCreatedAt(createdAt: Date): string {
  // 7 days from creation date (date-level)
  const due = addDaysUtc(createdAt, 7)
  return toIsoDate(due)
}
