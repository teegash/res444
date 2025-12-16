import { NextRequest, NextResponse } from 'next/server'
import { sendSMSWithLogging } from '@/lib/sms/smsService'
import { validatePhoneNumber } from '@/lib/sms/africasTalking'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toIsoDate, waterPeriodStartForCreatedAt, waterDueDateForCreatedAt } from '@/lib/invoices/rentPeriods'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    const {
      tenantName,
      tenantPhone,
      tenantUserId,
      unitId,
      propertyName,
      unitNumber,
      unitsConsumed,
      pricePerUnit,
      totalAmount,
      previousReading,
      currentReading,
      notes,
      dueDate,
    } = body || {}

    if (!tenantPhone) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tenant phone number is required.',
        },
        { status: 400 }
      )
    }

    const phoneValidation = validatePhoneNumber(tenantPhone)
    if (!phoneValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: phoneValidation.error || 'Phone number format is invalid.',
        },
        { status: 400 }
      )
    }

    if (!unitsConsumed || !totalAmount) {
      return NextResponse.json(
        { success: false, error: 'Invoice totals are missing. Please recalculate before sending.' },
        { status: 400 }
      )
    }

    const invoiceRef = `INV-${Date.now().toString().slice(-6)}`
    const formattedUnits = Number(unitsConsumed).toFixed(2)
    const formattedRate = Number(pricePerUnit || 0).toFixed(2)
    const formattedTotal = Number(totalAmount).toFixed(2)
    const createdAt = new Date()
    const periodStart = waterPeriodStartForCreatedAt(createdAt)
    const periodStartIso = toIsoDate(periodStart)
    const dueDateDisplay = dueDate || waterDueDateForCreatedAt(createdAt)

    const message = [
      `Hello ${tenantName || 'tenant'},`,
      `Water bill for ${propertyName || 'your property'}${unitNumber ? ` (Unit ${unitNumber})` : ''}.`,
      `Prev: ${previousReading || '-'} | Curr: ${currentReading || '-'}.`,
      `Usage: ${formattedUnits} units @ KES ${formattedRate}. Total: KES ${formattedTotal}.`,
      `Due: ${dueDateDisplay}. Ref: ${invoiceRef}.`,
      notes ? `Note: ${notes.slice(0, 100)}` : '',
      'Thank you.'
    ]
      .filter(Boolean)
      .join(' ')

    if (!tenantUserId || !unitId) {
      return NextResponse.json(
        { success: false, error: 'Tenant and unit identifiers are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[WaterBill.Send] membership lookup failed', membershipError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const { data: tenantProfile } = await adminSupabase
      .from('user_profiles')
      .select('id')
      .eq('id', tenantUserId)
      .eq('organization_id', membership.organization_id)
      .maybeSingle()

    if (!tenantProfile) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found in your organization.' },
        { status: 404 }
      )
    }

    const { data: lease, error: leaseError } = await adminSupabase
      .from('leases')
      .select('id, tenant_user_id, unit_id')
      .eq('tenant_user_id', tenantUserId)
      .eq('unit_id', unitId)
      .eq('organization_id', membership.organization_id)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError || !lease) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active lease found for this tenant and unit.',
        },
        { status: 400 }
      )
    }

    const { data: existingInvoice } = await adminSupabase
      .from('invoices')
      .select('id')
      .eq('lease_id', lease.id)
      .eq('invoice_type', 'water')
      .eq('organization_id', membership.organization_id)
      .eq('period_start', periodStartIso)
      .maybeSingle()

    const { data: invoice, error: invoiceError } = await adminSupabase
      .from('invoices')
      .upsert(
        {
          lease_id: lease.id,
          invoice_type: 'water',
          amount: Number(totalAmount),
          period_start: periodStartIso,
          due_date: dueDateDisplay,
          status: false,
          organization_id: membership.organization_id,
          months_covered: 1,
          description: `Water bill for ${periodStart.toLocaleString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}`,
        },
        { onConflict: 'lease_id,invoice_type,period_start', returning: 'representation' }
      )
      .select('id')
      .single()

    if (invoiceError) {
      throw invoiceError
    }

    const invoiceId = invoice?.id || existingInvoice?.id || null

    const billingMonth = periodStartIso

    await adminSupabase
      .from('water_bills')
      .upsert(
        {
          unit_id: unitId,
          organization_id: membership.organization_id,
          billing_month: billingMonth,
          meter_reading_start: previousReading ? Number(previousReading) : null,
          meter_reading_end: currentReading ? Number(currentReading) : null,
          units_consumed: Number(unitsConsumed),
          amount: Number(totalAmount),
          status: 'invoiced_separately',
          added_to_invoice_id: invoiceId,
          added_by: user.id,
          added_at: new Date().toISOString(),
          is_estimated: false,
          notes: notes || null,
        },
        { onConflict: 'unit_id,billing_month,organization_id' }
      )

    await adminSupabase.from('communications').insert({
      sender_user_id: user.id,
      recipient_user_id: tenantUserId,
      organization_id: membership.organization_id,
      related_entity_type: 'payment',
      related_entity_id: invoiceId,
      message_text: `A new water bill (${invoiceRef}) for ${propertyName || 'your unit'} is due on ${dueDateDisplay}.`,
      message_type: 'in_app',
      read: false,
    })

    const smsResult = await sendSMSWithLogging({
      phoneNumber: tenantPhone,
      message,
      senderUserId: user.id,
      recipientUserId: tenantUserId,
      relatedEntityType: 'payment',
      relatedEntityId: invoiceId,
    })

    if (!smsResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: smsResult.error || 'Failed to send SMS invoice.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { communicationId: smsResult.communicationId, invoiceId },
    })
  } catch (error) {
    console.error('[WaterBill.Send] Failed to send invoice SMS', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS invoice.',
      },
      { status: 500 }
    )
  }
}
