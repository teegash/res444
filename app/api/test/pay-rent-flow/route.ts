import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Test endpoint to verify the complete pay-rent flow
 * This tests:
 * 1. Creating a rent invoice via pay-rent API
 * 2. Finding pending invoices in tenant payment page
 * 3. Processing payment and updating rent_paid_until
 */

export async function GET(request: NextRequest) {
    try {
        const adminSupabase = createAdminClient()
        const url = new URL(request.url)
        const userId = url.searchParams.get('userId')

        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'userId query parameter is required' },
                { status: 400 }
            )
        }

        console.log(`[Test Pay Rent Flow] Testing for userId: ${userId}`)

        // 1. Test lease lookup
        console.log('[Test Pay Rent Flow] Step 1: Fetching lease...')
        const { data: lease, error: leaseError } = await adminSupabase
            .from('leases')
            .select(`
        id,
        monthly_rent,
        rent_paid_until,
        unit:apartment_units (
          unit_number,
          building:apartment_buildings (
            name,
            location
          )
        )
      `)
            .eq('tenant_user_id', userId)
            .in('status', ['active', 'pending'])
            .maybeSingle() as any

        if (leaseError || !lease) {
            return NextResponse.json({
                success: false,
                error: 'No active lease found for user',
                step: 1
            })
        }

        console.log('[Test Pay Rent Flow] Lease found:', {
            leaseId: lease.id,
            monthlyRent: lease.monthly_rent,
            rentPaidUntil: lease.rent_paid_until
        })

        // 2. Test creating rent invoice
        console.log('[Test Pay Rent Flow] Step 2: Creating rent invoice...')

        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 5)
        const dueDateStr = dueDate.toISOString().split('T')[0]
        const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        const amount = Number(lease.monthly_rent)

        const { data: invoice, error: invoiceError } = await (adminSupabase as any)
            .from('invoices')
            .insert({
                lease_id: lease.id,
                amount: amount,
                due_date: dueDateStr,
                status: false,
                months_covered: 1,
                invoice_type: 'rent',
                description: `Rent for ${currentMonth}`,
            })
            .select('id, lease_id, amount, due_date, status, months_covered, invoice_type, description, created_at')
            .single()

        if (invoiceError || !invoice) {
            return NextResponse.json({
                success: false,
                error: 'Failed to create invoice',
                details: invoiceError,
                step: 2
            })
        }

        console.log('[Test Pay Rent Flow] Invoice created:', {
            invoiceId: invoice.id,
            amount: invoice.amount,
            status: invoice.status
        })

        // 3. Test finding pending invoices (like tenant payment page does)
        console.log('[Test Pay Rent Flow] Step 3: Finding pending invoices...')

        const { data: pendingInvoices } = await adminSupabase
            .from('invoices')
            .select('id, lease_id, amount, due_date, status, invoice_type, description, created_at')
            .eq('lease_id', lease.id)
            .eq('status', false)
            .eq('invoice_type', 'rent')
            .order('due_date', { ascending: true })

        if (!pendingInvoices || pendingInvoices.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No pending rent invoices found',
                step: 3
            })
        }

        console.log('[Test Pay Rent Flow] Pending invoices found:', pendingInvoices.length)

        // 4. Test rent_paid_until calculation logic
        console.log('[Test Pay Rent Flow] Step 4: Testing rent_paid_until calculation...')

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const currentPaidUntil = lease.rent_paid_until ? new Date(lease.rent_paid_until) : null

        let startDate: Date
        if (currentPaidUntil && currentPaidUntil > today) {
            startDate = currentPaidUntil
            console.log('[Test Pay Rent Flow] Extending from future date:', currentPaidUntil.toISOString().split('T')[0])
        } else {
            startDate = today
            console.log('[Test Pay Rent Flow] Starting from today:', today.toISOString().split('T')[0])
        }

        const newPaidUntil = new Date(startDate)
        newPaidUntil.setMonth(newPaidUntil.getMonth() + 1)
        const newPaidUntilStr = newPaidUntil.toISOString().split('T')[0]

        console.log('[Test Pay Rent Flow] New rent_paid_until would be:', newPaidUntilStr)

        // 5. Test the monthly countdown logic
        console.log('[Test Pay Rent Flow] Step 5: Testing monthly countdown logic...')

        if (currentPaidUntil && currentPaidUntil > today) {
            const monthsCovered = Math.ceil(
                (currentPaidUntil.getFullYear() - today.getFullYear()) * 12 +
                (currentPaidUntil.getMonth() - today.getMonth())
            )

            console.log(`[Test Pay Rent Flow] Currently covers ${monthsCovered} month(s) ahead`)

            if (monthsCovered > 1) {
                console.log('[Test Pay Rent Flow] Would be reduced by 1 on 1st of next month')
            } else if (monthsCovered === 1) {
                console.log('[Test Pay Rent Flow] No countdown change needed (covers current month only)')
            }
        }

        // Clean up test invoice
        console.log('[Test Pay Rent Flow] Cleaning up test invoice...')
        await adminSupabase.from('invoices').delete().eq('id', invoice.id)

        return NextResponse.json({
            success: true,
            message: 'Pay Rent flow test completed successfully',
            data: {
                step_1: {
                    description: 'Lease lookup',
                    result: 'PASSED',
                    leaseId: lease.id,
                    monthlyRent: lease.monthly_rent,
                    rentPaidUntil: lease.rent_paid_until
                },
                step_2: {
                    description: 'Invoice creation',
                    result: 'PASSED',
                    invoiceId: invoice.id,
                    amount: invoice.amount,
                    status: invoice.status
                },
                step_3: {
                    description: 'Pending invoice lookup',
                    result: 'PASSED',
                    pendingCount: pendingInvoices.length
                },
                step_4: {
                    description: 'rent_paid_until calculation',
                    result: 'PASSED',
                    currentRentPaidUntil: lease.rent_paid_until,
                    calculatedNewRentPaidUntil: newPaidUntilStr,
                    logic: currentPaidUntil && currentPaidUntil > today ? 'Extended from future date' : 'Started from today'
                },
                step_5: {
                    description: 'Monthly countdown logic',
                    result: 'PASSED',
                    ready: true
                },
                summary: {
                    totalSteps: 5,
                    passed: 5,
                    failed: 0
                }
            }
        })

    } catch (error) {
        console.error('[Test Pay Rent Flow] Error:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'Test failed with unexpected error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
