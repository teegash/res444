export function invoiceStatusToBoolean(status: boolean | string | null | undefined): boolean {
  if (typeof status === 'boolean') return status
  if (typeof status === 'string') {
    return status.toLowerCase() === 'paid'
  }
  return false
}

export function isInvoiceOverdue(
  status: boolean | string | null | undefined,
  dueDate: string | null | undefined
): boolean {
  if (invoiceStatusToBoolean(status)) {
    return false
  }
  if (!dueDate) {
    return false
  }
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) {
    return false
  }
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}
