import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMSWithLogging } from '@/lib/sms/smsService'
import { getTemplateContent } from '@/lib/sms/templateStore'
import { renderTemplateContent } from '@/lib/sms/templateRenderer'
import { validatePhoneNumber } from '@/lib/sms/africasTalking'
import { toIsoDate, waterPeriodStartForCreatedAt, waterDueDateForCreatedAt } from '@/lib/invoices/rentPeriods'

type BulkItem = {
  unitId: string
  unitNumber?: string | null
  tenantUserId: string
  tenantName?: string | null
  tenantPhone: string
  previousReading: number | null
  currentReading: number | null
  pricePerUnit: number
  notes?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { propertyId, propertyName, dueDate, notes, items } = body || {}

    if (!propertyId) {
      return NextResponse.json({ success: false, error: 'propertyId is required.' }, { status: 400 })
    }

    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ success: false, error: 'items[] is required.' }, { status: 400 })
    }

    if (items.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Batch too large. Send at most 10 items per request.' },
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
    if (!adminSupabase) {
      return NextResponse.json(
        { success: false, error: 'Admin client not configured.' },
        { status: 500 }
      )
    }
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[WaterBill.BulkSend] membership lookup failed', membershipError)
      return NextResponse.json(
        { success: false, error: 'Unable to verify organization.' },
        { status: 500 }
      )
    }

    const orgId = membership?.organization_id
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const { data: building } = await adminSupabase
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('id', propertyId)
      .maybeSingle()

    if (!building) {
      return NextResponse.json({ success: false, error: 'Property not found.' }, { status: 404 })
    }

    const createdAt = new Date()
    const periodStart = waterPeriodStartForCreatedAt(createdAt)
    const periodStartIso = toIsoDate(periodStart)
    const dueDateDisplay = dueDate || waterDueDateForCreatedAt(createdAt)
    const billingMonth = periodStartIso

    const results: Array<{ unitId: string; ok: boolean; invoiceId?: string; error?: string }> = []

    for (const raw of items as BulkItem[]) {
      const unitId = raw.unitId
      const tenantUserId = raw.tenantUserId

      try {
        if (!raw.tenantPhone) throw new Error('Missing tenant phone number.')

        const phoneValidation = validatePhoneNumber(raw.tenantPhone)
        if (!phoneValidation.valid) {
          throw new Error(phoneValidation.error || 'Invalid phone number.')
        }

        const prev = raw.previousReading ?? null
        const curr = raw.currentReading ?? null

        if (curr === null || Number.isNaN(Number(curr))) {
          throw new Error('Current reading is required.')
        }
        if (prev !== null && curr < prev) {
          throw new Error('Current reading cannot be less than previous reading.')
        }

        const unitsConsumed = Math.max(0, Number(curr) - Number(prev ?? 0))
        if (unitsConsumed <= 0) throw new Error('Units consumed must be greater than 0.')

        const rate = Number(raw.pricePerUnit || 0)
        if (!rate || rate <= 0) throw new Error('Price per unit must be greater than 0.')

        const totalAmount = Number((unitsConsumed * rate).toFixed(2))
        const invoiceRef = `INV-${Date.now().toString().slice(-6)}`

        const { data: tenantProfile } = await adminSupabase
          .from('user_profiles')
          .select('id')
          .eq('id', tenantUserId)
          .eq('organization_id', orgId)
          .maybeSingle()

        if (!tenantProfile) throw new Error('Tenant not found in your organization.')

        const { data: lease } = await adminSupabase
          .from('leases')
          .select('id, tenant_user_id, unit_id, start_date, status')
          .eq('tenant_user_id', tenantUserId)
          .eq('unit_id', unitId)
          .eq('organization_id', orgId)
          .in('status', ['active', 'pending', 'renewed'])
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!lease) throw new Error('No active lease found for this tenant and unit.')

        const { data: invoice, error: invoiceError } = await adminSupabase
          .from('invoices')
          .upsert(
            {
              lease_id: lease.id,
              invoice_type: 'water',
              amount: totalAmount,
              period_start: periodStartIso,
              due_date: dueDateDisplay,
              status: false,
              organization_id: orgId,
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

        if (invoiceError) throw invoiceError
        const invoiceId = invoice?.id

        const waterBillPayload = {
          unit_id: unitId,
          organization_id: orgId,
          billing_month: billingMonth,
          meter_reading_start: prev,
          meter_reading_end: curr,
          units_consumed: unitsConsumed,
          amount: totalAmount,
          status: 'invoiced_separately',
          added_to_invoice_id: invoiceId,
          added_by: user.id,
          added_at: new Date().toISOString(),
          is_estimated: false,
          notes: raw.notes || notes || null,
        }

        const { error: waterBillError } = await adminSupabase
          .from('water_bills')
          .upsert(waterBillPayload, { onConflict: 'unit_id,billing_month' })

        if (waterBillError) {
          const { error: fallbackError } = await adminSupabase
            .from('water_bills')
            .upsert(waterBillPayload, { onConflict: 'unit_id,billing_month,organization_id' })

          if (fallbackError) throw fallbackError
        }

        await adminSupabase.from('communications').insert({
          sender_user_id: user.id,
          recipient_user_id: tenantUserId,
          organization_id: orgId,
          related_entity_type: 'payment',
          related_entity_id: invoiceId,
          message_text: `A new water bill (${invoiceRef}) is due on ${dueDateDisplay}.`,
          message_type: 'in_app',
          read: false,
        })

        const formattedUnits = unitsConsumed.toFixed(2)
        const formattedRate = rate.toFixed(2)
        const formattedTotal = totalAmount.toFixed(2)
        const template = await getTemplateContent(orgId, 'water_bill_invoice')
        const noteLine = raw.notes || notes ? `Note: ${String(raw.notes || notes).slice(0, 100)}` : ''
        const smsMessage = renderTemplateContent(template, {
          '[TENANT_NAME]': raw.tenantName || 'tenant',
          '[PROPERTY_NAME]': propertyName || building.name || 'your property',
          '[UNIT_NUMBER]': raw.unitNumber || '-',
          '[PREVIOUS_READING]': prev ?? '-',
          '[CURRENT_READING]': curr ?? '-',
          '[USAGE_UNITS]': formattedUnits,
          '[RATE]': formattedRate,
          '[TOTAL]': formattedTotal,
          '[DUE_DATE]': dueDateDisplay,
          '[INVOICE_REF]': invoiceRef,
          '[NOTE_LINE]': noteLine,
        })
          .replace(/\s+/g, ' ')
          .trim()

        const smsResult = await sendSMSWithLogging({
          phoneNumber: raw.tenantPhone,
          message: smsMessage,
          senderUserId: user.id,
          recipientUserId: tenantUserId,
          relatedEntityType: 'payment',
          relatedEntityId: invoiceId,
        })

        if (!smsResult.success) {
          throw new Error(smsResult.error || 'Failed to send SMS.')
        }

        results.push({ unitId, ok: true, invoiceId })
      } catch (err: any) {
        results.push({ unitId, ok: false, error: err?.message || 'Failed' })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        periodStart: periodStartIso,
        dueDate: dueDateDisplay,
        results,
      },
    })
  } catch (error) {
    console.error('[WaterBill.BulkSend] Failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Bulk send failed.' },
      { status: 500 }
    )
  }
}
