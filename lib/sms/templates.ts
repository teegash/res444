'use server'

/**
 * SMS Message Templates
 * All templates follow Kenya SMS format and include RentalKenya branding
 */

export interface RentReminderData {
  tenantName: string
  amount: number
  dueDate: string
  invoiceId: string
  isOverdue?: boolean
}

export interface WaterBillReminderData {
  caretakerName: string
  unitNumber: string
  buildingName: string
  month: string
  amount: number
}

export interface MaintenanceUpdateData {
  tenantName: string
  requestTitle: string
  status: string
  unitNumber: string
  assignedTo?: string
}

export interface LeaseRenewalData {
  tenantName: string
  unitNumber: string
  buildingName: string
  currentEndDate: string
  daysUntilExpiry: number
}

export interface PaymentConfirmationData {
  tenantName: string
  amount: number
  invoiceId: string
  receiptNumber?: string
  paymentMethod: string
}

/**
 * Format currency for SMS
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format date for SMS
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Generate rent payment reminder message
 */
export function generateRentReminderMessage(data: RentReminderData): string {
  const formattedAmount = formatCurrency(data.amount)
  const formattedDate = formatDate(data.dueDate)
  const invoiceShortId = data.invoiceId.substring(0, 8).toUpperCase()

  if (data.isOverdue) {
    return `RentalKenya: Your rent payment of ${formattedAmount} is OVERDUE (due ${formattedDate}). Invoice #${invoiceShortId}. Please make payment immediately to avoid penalties.`
  } else {
    return `RentalKenya: Reminder - Your rent payment of ${formattedAmount} is due on ${formattedDate}. Invoice #${invoiceShortId}. Please make payment to avoid late fees.`
  }
}

/**
 * Generate water bill reminder message
 */
export function generateWaterBillReminderMessage(data: WaterBillReminderData): string {
  const formattedAmount = formatCurrency(data.amount)
  return `RentalKenya: Water bill reminder for ${data.buildingName}, Unit ${data.unitNumber} - ${data.month}. Amount: ${formattedAmount}. Please add meter reading.`
}

/**
 * Generate maintenance update message
 */
export function generateMaintenanceUpdateMessage(data: MaintenanceUpdateData): string {
  const statusText = data.status.replace('_', ' ').toLowerCase()
  const assignedText = data.assignedTo ? ` Assigned to: ${data.assignedTo}.` : ''

  return `RentalKenya: Maintenance update for "${data.requestTitle}" in Unit ${data.unitNumber}. Status: ${statusText}.${assignedText} Check your dashboard for details.`
}

/**
 * Generate lease renewal alert message
 */
export function generateLeaseRenewalMessage(data: LeaseRenewalData): string {
  const formattedDate = formatDate(data.currentEndDate)

  if (data.daysUntilExpiry === 0) {
    return `RentalKenya: URGENT - Your lease for Unit ${data.unitNumber}, ${data.buildingName} expires TODAY (${formattedDate}). Please contact management immediately.`
  } else if (data.daysUntilExpiry === 1) {
    return `RentalKenya: URGENT - Your lease for Unit ${data.unitNumber}, ${data.buildingName} expires TOMORROW (${formattedDate}). Please contact management.`
  } else if (data.daysUntilExpiry <= 7) {
    return `RentalKenya: Your lease for Unit ${data.unitNumber}, ${data.buildingName} expires in ${data.daysUntilExpiry} days (${formattedDate}). Please contact management to renew.`
  } else {
    return `RentalKenya: Your lease for Unit ${data.unitNumber}, ${data.buildingName} expires on ${formattedDate} (${data.daysUntilExpiry} days remaining). Please plan for renewal.`
  }
}

/**
 * Generate payment confirmation message
 */
export function generatePaymentConfirmationMessage(data: PaymentConfirmationData): string {
  const formattedAmount = formatCurrency(data.amount)
  const invoiceShortId = data.invoiceId.substring(0, 8).toUpperCase()
  const receiptText = data.receiptNumber ? ` Receipt: ${data.receiptNumber}.` : ''

  return `RentalKenya: Your payment of ${formattedAmount} via ${data.paymentMethod} has been confirmed. Invoice #${invoiceShortId} is now paid.${receiptText} Thank you!`
}

/**
 * Generate payment rejection message
 */
export function generatePaymentRejectionMessage(
  amount: number,
  invoiceId: string,
  reason: string
): string {
  const formattedAmount = formatCurrency(amount)
  const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()

  return `RentalKenya: Your payment of ${formattedAmount} for Invoice #${invoiceShortId} has been rejected. Reason: ${reason}. Please contact support for assistance.`
}

/**
 * Generate payment verification message (for manual verification)
 */
export function generatePaymentVerificationMessage(
  amount: number,
  invoiceId: string,
  status: 'approved' | 'rejected',
  reason?: string
): string {
  const formattedAmount = formatCurrency(amount)
  const invoiceShortId = invoiceId.substring(0, 8).toUpperCase()

  if (status === 'approved') {
    return `RentalKenya: Your payment of ${formattedAmount} has been verified and approved. Invoice #${invoiceShortId} is now paid. Thank you!`
  } else {
    const reasonText = reason ? ` Reason: ${reason}.` : ''
    return `RentalKenya: Your payment of ${formattedAmount} for Invoice #${invoiceShortId} has been rejected.${reasonText} Please contact support for assistance.`
  }
}

