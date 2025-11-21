export type PaymentRecord = {
  id: string
  invoiceId: string | null
  tenantId: string | null
  tenantName: string
  tenantPhone: string | null
  propertyName: string | null
  propertyLocation: string | null
  unitLabel: string | null
  amount: number
  paymentMethod: string | null
  invoiceType: string | null
  invoiceAmount: number | null
  invoiceDueDate: string | null
  paymentDate: string | null
  mpesaReceiptNumber: string | null
  bankReferenceNumber: string | null
  depositSlipUrl: string | null
  verified: boolean
  verifiedBy: string | null
  verifiedAt: string | null
  mpesaAutoVerified: boolean
  mpesaQueryStatus: string | null
  mpesaResponseCode: string | null
  lastStatusCheck: string | null
  retryCount: number
  notes: string | null
  monthsPaid?: number
}

export type PaymentStats = {
  pendingAmount: number
  pendingCount: number
  depositsPendingAmount: number
  depositsPendingCount: number
  depositsRejectedCount: number
  verifiedAmount: number
  verifiedCount: number
  autoVerifiedAmount: number
  autoVerifiedCount: number
  managerVerifiedAmount: number
  managerVerifiedCount: number
  failedAmount: number
  failedCount: number
}

export type IntegrationSummary = {
  darajaEnvironment: string
  shortcodeMasked: string | null
  autoVerifyEnabled: boolean
  autoVerifyFrequencySeconds: number
  maxRetries: number
  queryTimeoutSeconds: number
  lastTestedAt: string | null
  lastTestStatus: string | null
  lastAutoCheck: string | null
  autoVerifiedToday: number
  pendingAmount: number
}

export type FailureBreakdown = {
  reason: string
  count: number
  amount: number
}
