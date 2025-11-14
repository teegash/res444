/**
 * Example usage of payment verification system
 * 
 * This file demonstrates how to use the payment verification endpoints
 */

// Example 1: Upload deposit slip and create payment (from client)
export async function createPaymentWithDepositSlip(
  invoiceId: string,
  amount: number,
  paymentMethod: 'bank_transfer' | 'cash' | 'cheque',
  depositSlipFile: File,
  bankReferenceNumber?: string
) {
  const formData = new FormData()
  formData.append('invoice_id', invoiceId)
  formData.append('amount', amount.toString())
  formData.append('payment_method', paymentMethod)
  formData.append('deposit_slip', depositSlipFile)
  
  if (bankReferenceNumber) {
    formData.append('bank_reference_number', bankReferenceNumber)
  }

  const response = await fetch('/api/payments/verify', {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser will set it with boundary
  })

  const result = await response.json()

  if (result.success) {
    console.log('Payment created:', result.data)
    // {
    //   payment_id: "uuid",
    //   invoice_id: "uuid",
    //   amount: 10000,
    //   verified: false
    // }
  } else {
    console.error('Error:', result.error)
  }

  return result
}

// Example 2: Approve payment (manager)
export async function approvePayment(paymentId: string, notes?: string) {
  const response = await fetch(`/api/payments/${paymentId}/verify`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notes: notes || 'Payment verified and approved',
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('Payment approved:', result.data)
  } else {
    console.error('Error:', result.error)
  }

  return result
}

// Example 3: Reject payment (manager)
export async function rejectPayment(
  paymentId: string,
  reason: string,
  notes?: string
) {
  const response = await fetch(`/api/payments/${paymentId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: reason,
      notes: notes,
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('Payment rejected:', result.data)
  } else {
    console.error('Error:', result.error)
  }

  return result
}

// Example 4: React component for payment upload
export const PaymentUploadExample = `
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PaymentUploadForm({ invoiceId, amount }) {
  const [file, setFile] = useState(null)
  const [bankRef, setBankRef] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('invoice_id', invoiceId)
    formData.append('amount', amount.toString())
    formData.append('payment_method', 'bank_transfer')
    formData.append('deposit_slip', file)
    if (bankRef) {
      formData.append('bank_reference_number', bankRef)
    }

    try {
      const response = await fetch('/api/payments/verify', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setMessage('Payment submitted successfully! Awaiting verification.')
      } else {
        setMessage(result.error || 'Payment submission failed')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <Label>Upload Deposit Slip *</Label>
        <Input
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => setFile(e.target.files[0])}
          required
        />
        <p className="text-sm text-muted-foreground">
          Supported: JPG, PNG, PDF (Max 5MB)
        </p>
      </div>
      
      <div>
        <Label>Bank Reference Number</Label>
        <Input
          value={bankRef}
          onChange={(e) => setBankRef(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <Button type="submit" disabled={loading || !file}>
        {loading ? 'Submitting...' : 'Submit Payment'}
      </Button>

      {message && <p>{message}</p>}
    </form>
  )
}
`

// Example 5: Manager approval component
export const PaymentApprovalExample = `
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function PaymentApprovalButtons({ paymentId }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try {
      const response = await fetch(\`/api/payments/\${paymentId}/verify\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const result = await response.json()
      if (result.success) {
        alert('Payment approved!')
      }
    } catch (error) {
      alert('Error approving payment')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return

    setLoading(true)
    try {
      const response = await fetch(\`/api/payments/\${paymentId}/reject\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes }),
      })
      const result = await response.json()
      if (result.success) {
        alert('Payment rejected!')
      }
    } catch (error) {
      alert('Error rejecting payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes..."
      />
      <div className="flex gap-2">
        <Button onClick={handleApprove} disabled={loading} variant="default">
          Approve
        </Button>
        <Button onClick={handleReject} disabled={loading} variant="destructive">
          Reject
        </Button>
      </div>
    </div>
  )
}
`

// Example 6: Success response structure
export const successResponseExample = {
  createPayment: {
    success: true,
    message: 'Payment submitted successfully. Awaiting verification.',
    data: {
      payment_id: 'uuid',
      invoice_id: 'uuid',
      amount: 10000,
      verified: false,
    },
  },
  approvePayment: {
    success: true,
    message: 'Payment verified successfully',
    data: {
      payment_id: 'uuid',
      invoice_id: 'uuid',
      amount: 10000,
      verified: true,
    },
  },
  rejectPayment: {
    success: true,
    message: 'Payment rejected successfully',
    data: {
      payment_id: 'uuid',
      invoice_id: 'uuid',
      amount: 10000,
      verified: false,
    },
  },
}

// Example 7: Error response examples
export const errorExamples = {
  invalidFile: {
    success: false,
    error: 'File size exceeds maximum allowed size of 5MB',
  },
  missingDepositSlip: {
    success: false,
    error: 'Deposit slip is required for bank transfer payments',
  },
  invoiceNotFound: {
    success: false,
    error: 'Invoice not found',
  },
  noPermission: {
    success: false,
    error: 'You do not have permission to verify payments',
  },
  alreadyVerified: {
    success: false,
    error: 'Payment is already verified',
  },
  amountExceeds: {
    success: false,
    error: 'Payment amount (KES 15000) cannot exceed invoice amount (KES 10000)',
  },
}

