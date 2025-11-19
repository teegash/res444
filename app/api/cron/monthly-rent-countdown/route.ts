import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Monthly Rent Countdown Cron Job
 * 
 * This endpoint should be called on the 1st of each month to:
 * - Check all leases where rent_paid_until is in the future
 * - Decrement months_paid counter by 1 
 * - Adjust rent_paid_until date to reflect the remaining months
 * 
 * Example logic:
 * - If rent_paid_until shows Feb 2025 and it's January 1st, reduce to show Jan 2025
 * - This maintains accurate "months paid ahead" tracking
 */

export async function POST(request: NextRequest) {
    try {
        const adminSupabase = createAdminClient()

        // Get current date
        const today = new Date()
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)

        console.log(`[Monthly Rent Countdown] Running for ${today.toISOString().split('T')[0]}`)
        console.log(`[Monthly Rent Countdown] Current month: ${currentMonthStart.toISOString().split('T')[0]}`)
        console.log(`[Monthly Rent Countdown] Last month: ${lastMonthStart.toISOString().split('T')[0]}`)

        // Get all active leases with rent_paid_until in the future
        const { data: leases, error: leasesError } = await adminSupabase
            .from('leases')
            .select('id, rent_paid_until, monthly_rent, tenant_user_id')
            .in('status', ['active', 'pending'])
            .not('rent_paid_until', 'is', null) as any

        if (leasesError) {
            console.error('[Monthly Rent Countdown] Error fetching leases:', leasesError)
            return NextResponse.json(
                { success: false, error: 'Failed to fetch leases' },
                { status: 500 }
            )
        }

        if (!leases || leases.length === 0) {
            console.log('[Monthly Rent Countdown] No leases found with rent_paid_until')
            return NextResponse.json({
                success: true,
                message: 'No leases found to update',
                data: { updated: 0 }
            })
        }

        let updatedCount = 0
        const updates: Array<{ lease_id: string; old_date: string; new_date: string; months_reduced: number }> = []

        // Process each lease
        for (const lease of leases as any[]) {
            if (!lease.rent_paid_until) continue

            const rentPaidUntil = new Date(lease.rent_paid_until)

            // Only process leases where rent is paid ahead (rent_paid_until > today)
            if (rentPaidUntil > today) {
                // Calculate how many months are currently covered
                const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                const paidUntilMonth = new Date(rentPaidUntil.getFullYear(), rentPaidUntil.getMonth(), 1)

                // Calculate months difference
                const monthsCovered = (paidUntilMonth.getFullYear() - currentMonth.getFullYear()) * 12 +
                    (paidUntilMonth.getMonth() - currentMonth.getMonth())

                if (monthsCovered > 1) {
                    // We need to reduce by 1 month since one month has passed
                    const newRentPaidUntil = new Date(rentPaidUntil)
                    newRentPaidUntil.setMonth(newRentPaidUntil.getMonth() - 1)
                    const newRentPaidUntilStr = newRentPaidUntil.toISOString().split('T')[0]

                    // Update lease - using proper type casting
                    const { error: updateError } = await (adminSupabase as any)
                        .from('leases')
                        .update({ rent_paid_until: newRentPaidUntilStr })
                        .eq('id', lease.id)

                    if (updateError) {
                        console.error(`[Monthly Rent Countdown] Error updating lease ${lease.id}:`, updateError)
                        continue
                    }

                    updatedCount++
                    updates.push({
                        lease_id: lease.id,
                        old_date: lease.rent_paid_until,
                        new_date: newRentPaidUntilStr,
                        months_reduced: 1
                    })

                    console.log(`[Monthly Rent Countdown] Updated lease ${lease.id}: ${lease.rent_paid_until} -> ${newRentPaidUntilStr}`)
                } else if (monthsCovered === 1) {
                    // This lease is paid until the current month, should not be reduced
                    console.log(`[Monthly Rent Countdown] Lease ${lease.id} paid until current month, no change needed`)
                } else {
                    // This shouldn't happen since we filtered for rent_paid_until > today
                    console.log(`[Monthly Rent Countdown] Lease ${lease.id} has past rent_paid_until: ${lease.rent_paid_until}`)
                }
            }
        }

        // Log summary
        console.log(`[Monthly Rent Countdown] Summary:`)
        console.log(`[Monthly Rent Countdown] - Total leases checked: ${leases.length}`)
        console.log(`[Monthly Rent Countdown] - Leases updated: ${updatedCount}`)
        console.log(`[Monthly Rent Countdown] - Updates:`, updates)

        return NextResponse.json({
            success: true,
            message: 'Monthly rent countdown completed successfully',
            data: {
                total_leases: leases.length,
                updated: updatedCount,
                updates: updates,
                execution_date: today.toISOString().split('T')[0],
                current_month: currentMonthStart.toISOString().split('T')[0]
            }
        })

    } catch (error) {
        console.error('[Monthly Rent Countdown] Unexpected error:', error)
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// Handle GET requests (for testing)
export async function GET() {
    return NextResponse.json({
        success: true,
        message: 'Monthly Rent Countdown endpoint is active',
        description: 'This endpoint runs on the 1st of each month to adjust rent_paid_until tracking',
        method: 'POST',
        example_usage: 'Call this with POST on the 1st of each month'
    })
}
