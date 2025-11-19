import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac/routeGuards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
    try {
        const { userId } = await requireAuth();
        const body = await request.json().catch(() => ({}));
        const monthsCovered = Number(body.months_covered) || 1;

        // Get lease for tenant with unit and building details
        const adminSupabase = createAdminClient();
        const { data: lease, error: leaseError } = await adminSupabase
            .from('leases')
            .select(`
                id, 
                monthly_rent, 
                rent_paid_until,
                unit:apartment_units (
                    id,
                    unit_number,
                    building:apartment_buildings (
                        id,
                        name,
                        location
                    )
                )
            `)
            .eq('tenant_user_id', userId)
            .in('status', ['active', 'pending'])
            .maybeSingle() as any;

        if (leaseError || !lease) {
            return NextResponse.json({ success: false, error: 'Lease not found.' }, { status: 404 });
        }

        // Calculate due date (5 days from now)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Get current month for invoice description
        const currentDate = new Date();
        const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Create invoice marked as PENDING (status: false)
        const amount = Number(lease.monthly_rent) * monthsCovered;
        const { data: invoice, error: invoiceError } = await adminSupabase
            .from('invoices')
            .insert({
                lease_id: lease.id,
                amount,
                due_date: dueDateStr,
                status: false, // PENDING - payment not yet made
                months_covered: monthsCovered,
                invoice_type: 'rent',
                description: `Rent for ${currentMonth}${monthsCovered > 1 ? ` (${monthsCovered} months)` : ''}`,
            })
            .select('id, lease_id, amount, due_date, status, months_covered, invoice_type, description, created_at')
            .single() as any;

        if (invoiceError || !invoice) {
            throw invoiceError ?? new Error('Failed to create invoice');
        }

        // Format response with unit and building details
        const unit = lease.unit;
        const building = unit?.building;

        const invoiceWithDetails = {
            ...invoice,
            amount: Number(invoice.amount),
            status: Boolean(invoice.status),
            rent_paid_until: lease.rent_paid_until || null,
            unit_label: unit?.unit_number || null,
            property_name: building?.name || null,
            property_location: building?.location || null,
        };

        return NextResponse.json({ success: true, data: { invoice: invoiceWithDetails } });
    } catch (error) {
        console.error('[PayRent] Failed', error);
        return NextResponse.json({ success: false, error: 'Failed to create rent invoice.' }, { status: 500 });
    }
}
