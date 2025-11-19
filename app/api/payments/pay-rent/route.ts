import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac/routeGuards';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateInvoiceStatus } from '@/lib/invoices/invoiceGeneration';

export async function POST(request: NextRequest) {
    try {
        const { userId } = await requireAuth();
        const body = await request.json().catch(() => ({}));
        const monthsCovered = Number(body.months_covered) || 1;

        // Get lease for tenant
        const adminSupabase = createAdminClient();
        const { data: lease, error: leaseError } = await adminSupabase
            .from('leases')
            .select('id, monthly_rent, rent_paid_until')
            .eq('tenant_user_id', userId)
            .in('status', ['active', 'pending'])
            .maybeSingle();

        if (leaseError || !lease) {
            return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 });
        }

        // Compute new rent_paid_until date
        const today = new Date();
        let currentPaidUntil = lease.rent_paid_until ? new Date(lease.rent_paid_until) : null;
        // If already paid beyond today, start from that date, otherwise start from today
        const startDate = currentPaidUntil && currentPaidUntil > today ? currentPaidUntil : today;
        const newPaidUntil = new Date(startDate);
        newPaidUntil.setMonth(newPaidUntil.getMonth() + monthsCovered);
        const newPaidUntilStr = newPaidUntil.toISOString().split('T')[0];

        // Create invoice marked as paid
        const amount = Number(lease.monthly_rent) * monthsCovered;
        const { data: invoice, error: invoiceError } = await adminSupabase
            .from('invoices')
            .insert({
                lease_id: lease.id,
                amount,
                due_date: newPaidUntilStr,
                status: true, // paid
                months_covered: monthsCovered,
                invoice_type: 'rent',
                description: `Rent payment for ${monthsCovered} month(s)`,
            })
            .select('id, amount, due_date, status, months_covered, invoice_type, description')
            .single();

        if (invoiceError || !invoice) {
            throw invoiceError ?? new Error('Failed to create invoice');
        }

        // Record payment
        const now = new Date().toISOString();
        await adminSupabase.from('payments').insert({
            invoice_id: invoice.id,
            tenant_user_id: userId,
            amount_paid: amount,
            payment_method: 'internal',
            verified: true,
            verified_by: userId,
            verified_at: now,
            months_paid: monthsCovered,
            notes: 'Auto‑paid rent via pay‑rent endpoint',
        });

        // Update lease rent_paid_until
        await adminSupabase
            .from('leases')
            .update({ rent_paid_until: newPaidUntilStr })
            .eq('id', lease.id);

        // Ensure invoice status is consistent
        await updateInvoiceStatus(invoice.id);

        return NextResponse.json({ success: true, data: { invoice } });
    } catch (error) {
        console.error('[PayRent] Failed', error);
        return NextResponse.json({ success: false, error: 'Failed to process rent payment.' }, { status: 500 });
    }
}
