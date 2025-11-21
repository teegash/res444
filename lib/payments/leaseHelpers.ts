'use server'

export function calculatePaidUntil(
  leasePaidUntil: string | null | undefined,
  invoiceDueDate: string | null | undefined,
  monthsPaid: number
): string | null {
  if (monthsPaid <= 0) {
    return leasePaidUntil || invoiceDueDate || null
  }

  const parseDate = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const dueDate = parseDate(invoiceDueDate)
  const existing = parseDate(leasePaidUntil)

  let baseDate: Date
  if (existing && (!dueDate || existing >= dueDate)) {
    baseDate = existing
  } else if (dueDate) {
    baseDate = dueDate
  } else if (existing) {
    baseDate = existing
  } else {
    baseDate = new Date()
  }

  const paidUntil = new Date(baseDate)
  paidUntil.setMonth(paidUntil.getMonth() + monthsPaid - 1)

  return paidUntil.toISOString().split('T')[0]
}
