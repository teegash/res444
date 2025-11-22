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
  let monthOffset = monthsPaid - 1

  if (existing && (!dueDate || existing >= dueDate)) {
    baseDate = existing
    monthOffset = monthsPaid
  } else if (dueDate) {
    baseDate = dueDate
    monthOffset = monthsPaid - 1
  } else if (existing) {
    baseDate = existing
    monthOffset = monthsPaid
  } else {
    baseDate = new Date()
    monthOffset = monthsPaid - 1
  }

  if (monthOffset < 0) {
    monthOffset = 0
  }

  const paidUntil = new Date(baseDate)
  paidUntil.setMonth(paidUntil.getMonth() + monthOffset)

  return paidUntil.toISOString().split('T')[0]
}
