import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac/routeGuards'
import { createPaymentWithDepositSlip } from '@/lib/payments/verification'
import { uploadDepositSlip } from '@/lib/storage/uploads'
import { validateFile } from '@/lib/storage/uploads'

/**
 * Create payment with deposit slip upload
 * Used by tenants to submit bank transfer, cash, or cheque payments
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await requireAuth()

    // 2. Parse form data (multipart/form-data for file upload)
    const formData = await request.formData()

    // Extract form fields
    const invoiceId = formData.get('invoice_id') as string
    const amount = formData.get('amount') as string
    const paymentMethod = formData.get('payment_method') as string
    const bankReferenceNumber = formData.get('bank_reference_number') as string | null
    const notes = formData.get('notes') as string | null
    const depositSlip = formData.get('deposit_slip') as File | null
    const monthsPaidValue = formData.get('months_paid') as string | null

    // 3. Validate required fields
    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'invoice_id is required',
        },
        { status: 400 }
      )
    }

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          error: 'amount is required',
        },
        { status: 400 }
      )
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Valid amount is required',
        },
        { status: 400 }
      )
    }

    if (!paymentMethod) {
      return NextResponse.json(
        {
          success: false,
          error: 'payment_method is required',
        },
        { status: 400 }
      )
    }

    const validPaymentMethods = ['bank_transfer', 'cash', 'cheque']
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json(
        {
          success: false,
          error: `payment_method must be one of: ${validPaymentMethods.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // 4. Validate and upload deposit slip if provided
    let depositSlipUrl: string | undefined

    if (depositSlip && depositSlip.size > 0) {
      // Validate file
      const fileValidation = validateFile(depositSlip, {
        maxSizeMB: 5,
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
      })

      if (!fileValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: fileValidation.error || 'Invalid deposit slip file',
          },
          { status: 400 }
        )
      }

      // Upload deposit slip
      const uploadResult = await uploadDepositSlip(depositSlip, userId)

      if (!uploadResult.success || !uploadResult.url) {
        return NextResponse.json(
          {
            success: false,
            error: uploadResult.error || 'Failed to upload deposit slip',
          },
          { status: 500 }
        )
      }

      depositSlipUrl = uploadResult.url
    } else if (paymentMethod === 'bank_transfer') {
      // Bank transfers should have a deposit slip
      return NextResponse.json(
        {
          success: false,
          error: 'Deposit slip is required for bank transfer payments',
        },
        { status: 400 }
      )
    }

    const monthsPaidRaw = monthsPaidValue ? parseInt(monthsPaidValue, 10) : 1
    const monthsPaid = Number.isFinite(monthsPaidRaw) ? Math.min(12, Math.max(1, monthsPaidRaw)) : 1

    // 5. Create payment record
    const result = await createPaymentWithDepositSlip(userId, {
      invoice_id: invoiceId,
      amount: amountNum,
      payment_method: paymentMethod as 'bank_transfer' | 'cash' | 'cheque',
      bank_reference_number: bankReferenceNumber || undefined,
      deposit_slip_url: depositSlipUrl,
      notes: notes || undefined,
      months_paid: monthsPaid,
    })

    if (!result.success) {
      // Determine status code
      let statusCode = 400
      if (result.error?.includes('not found')) {
        statusCode = 404
      } else if (result.error?.includes('permission') || result.error?.includes('only')) {
        statusCode = 403
      } else if (result.error?.includes('Failed')) {
        statusCode = 500
      }

      return NextResponse.json(result, { status: statusCode })
    }

    // 6. Return success response
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const err = error as Error
    console.error('Error in verify payment endpoint:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to create a payment with deposit slip.',
    },
    { status: 405 }
  )
}
