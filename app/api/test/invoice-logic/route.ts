import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateMonthlyInvoices } from '@/lib/invoices/invoiceGeneration'

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

        // 2. Calculate next month
        const today = new Date()
        const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
        const nextMonthStr = nextMonthDate.toISOString().slice(0, 7) // YYYY-MM

        // 3. Update rent_paid_until to cover next month
        // Set it to the end of next month
        const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0)

        console.log(`[Test] Updating lease ${lease.id} rent_paid_until to ${endOfNextMonth.toISOString()}`)

        // @ts-ignore
        await (supabase.from('leases') as any)
            .update({ rent_paid_until: endOfNextMonth.toISOString() })
            .eq('id', lease.id)

        // 4. Run invoice generation for next month
        console.log(`[Test] Generating invoices for user ${userId} for month ${nextMonthStr}`)
        const result = await generateMonthlyInvoices(userId, nextMonthStr)

        // 5. Check if invoice was created and is paid
        const { data: invoices, error: invoiceError } = (await supabase
            .from('invoices')
            .select('*')
            .eq('lease_id', lease.id)
            .ilike('due_date', `${nextMonthStr}%`)
            .eq('invoice_type', 'rent')) as { data: any[], error: any }

        let testPassed = false
        let message = ''

        if (invoices && invoices.length > 0) {
            const invoice = invoices[0]
            if (invoice.status === true) {
                testPassed = true
                message = 'Success: Invoice created with status=true (Paid)'
            } else {
                message = 'Failure: Invoice created but status=false (Unpaid)'
            }
        } else {
            message = 'Failure: No invoice created'
        }

        // 6. Revert changes (optional, but good practice)
        // We might want to keep the invoice to see it, but we should revert the lease date if we want to be clean.
        // For now, I'll leave it as this is a test route and I can manually fix if needed, 
        // or I can revert the lease date.
        // Let's revert the lease date to avoid messing up real data too much.
        if (originalPaidUntil) {
            // @ts-ignore
            await (supabase.from('leases') as any)
                .update({ rent_paid_until: originalPaidUntil })
                .eq('id', lease.id)
        } else {
            // If it was null, set it back to null
            // @ts-ignore
            await (supabase.from('leases') as any)
                .update({ rent_paid_until: null })
                .eq('id', lease.id)
        }

        // Clean up the test invoice
        if (invoices && invoices.length > 0) {
            await supabase.from('invoices').delete().eq('id', invoices[0].id)
        }

        return NextResponse.json({
            success: testPassed,
            message,
            details: {
                leaseId: lease.id,
                generatedResult: result,
                invoice: invoices ? invoices[0] : null
            }
        })

    } catch (error) {
        console.error('[Test] Error:', error)
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
    }
}
