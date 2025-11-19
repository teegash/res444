import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRentPaymentReminders } from '@/lib/invoices/reminders'

export async function GET() {
    const supabase = createAdminClient()

    try {
        // 1. Find a tenant with an active lease
        const { data: leases, error: leaseError } = (await supabase
            .from('leases')
            .select('id, tenant_user_id, rent_paid_until, monthly_rent')
            .eq('status', 'active')
            .limit(1)) as { data: any[], error: any }

        if (leaseError || !leases || leases.length === 0) {
            return NextResponse.json({ success: false, error: 'No active leases found to test with.' })
        }

        const lease = leases[0]
        const userId = lease.tenant_user_id
        const originalPaidUntil = lease.rent_paid_until

        // 2. Set rent_paid_until to NULL (simulate unpaid)
        console.log(`[Test] Setting lease ${lease.id} rent_paid_until to NULL`)
        // @ts-ignore
        await (supabase.from('leases') as any)
            .update({ rent_paid_until: null })
            .eq('id', lease.id)

        // 3. Run reminder logic for 26th
        console.log(`[Test] Running reminder logic for 26th`)
        const resultUnpaid = await sendRentPaymentReminders(26)

        // 4. Set rent_paid_until to cover next month (simulate paid)
        const today = new Date()
        const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        console.log(`[Test] Setting lease ${lease.id} rent_paid_until to ${endOfNextMonth.toISOString()}`)
        // @ts-ignore
        await (supabase.from('leases') as any)
            .update({ rent_paid_until: endOfNextMonth.toISOString() })
            .eq('id', lease.id)

        // 5. Run reminder logic for 26th again
        console.log(`[Test] Running reminder logic for 26th (should be skipped)`)
        const resultPaid = await sendRentPaymentReminders(26)

        // 6. Revert changes
        if (originalPaidUntil) {
            // @ts-ignore
            await (supabase.from('leases') as any)
                .update({ rent_paid_until: originalPaidUntil })
                .eq('id', lease.id)
        } else {
            // @ts-ignore
            await (supabase.from('leases') as any)
                .update({ rent_paid_until: null })
                .eq('id', lease.id)
        }

        return NextResponse.json({
            success: true,
            message: 'Test completed',
            results: {
                unpaid_scenario: resultUnpaid,
                paid_scenario: resultPaid
            }
        })

    } catch (error) {
        console.error('[Test] Error:', error)
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
    }
}
