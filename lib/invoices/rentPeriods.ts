export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

export function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

export function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function rentDueDateForPeriod(periodStart: Date): string {
  const dueDate = new Date(periodStart)
  dueDate.setUTCDate(dueDate.getUTCDate() + 5)
  return toIsoDate(dueDate)
}
