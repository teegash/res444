'use server'

import { createClient } from '@/lib/supabase/server'

export interface ReminderData {
  user_id: string
  related_entity_type: 'payment' | 'water_bill' | 'lease' | 'maintenance'
  related_entity_id: string
  reminder_type: 'rent_payment' | 'water_bill' | 'maintenance_update' | 'lease_renewal'
  message: string
  scheduled_for: string
}

export interface SendReminderResult {
  success: boolean
  message?: string
  error?: string
  reminders_sent?: number
}

/**
 * Get tenant phone number from lease
 */
async function getTenantPhone(leaseId: string): Promise<string | null> {
  try {
    const supabase = await createClient()

    const { data: lease } = await supabase
      .from('leases')
      .select(
        `
        tenant_user_id,
        user_profiles (
          phone_number
        )
      `
      )
      .eq('id', leaseId)
      .single()

    if (!lease) return null

    const profile = lease.user_profiles as { phone_number: string } | null
    return profile?.phone_number || null
  } catch (error) {
    console.error('Error getting tenant phone:', error)
    return null
  }
}

/**
 * Get unpaid invoices for reminder
 */
async function getUnpaidInvoicesForReminder(): Promise<
  Array<{
    id: string
    lease_id: string
    amount: number
    due_date: string
    tenant_user_id: string
    tenant_phone: string | null
  }>
> {
  try {
    const supabase = await createClient()

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        lease_id,
        amount,
        due_date,
        leases (
          tenant_user_id,
          user_profiles (
            phone_number
          )
        )
      `
      )
      .eq('status', false)

    if (error || !invoices) {
      return []
    }

    return invoices.map((invoice: any) => {
      const lease = invoice.leases as
        | {
          tenant_user_id: string
          user_profiles: { phone_number: string } | null
        }
        | null

      return {
        id: invoice.id,
        lease_id: invoice.lease_id,
        amount: parseFloat(invoice.amount.toString()),
        due_date: invoice.due_date,
        tenant_user_id: lease?.tenant_user_id || '',
        tenant_phone: lease?.user_profiles?.phone_number || null,
      }
    })
  } catch (error) {
    console.error('Error getting unpaid invoices:', error)
    return []
  }
}

/**
 * Create reminder record
 */
async function createReminder(reminder: ReminderData): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('reminders').insert({
      user_id: reminder.user_id,
      related_entity_type: reminder.related_entity_type,
      related_entity_id: reminder.related_entity_id,
      reminder_type: reminder.reminder_type,
      message: reminder.message,
      scheduled_for: reminder.scheduled_for,
      delivery_status: 'pending',
    })

    if (error) {
      console.error('Error creating reminder:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in createReminder:', error)
    return false
  }
}

/**
 * Send SMS reminder via Africa's Talking
 */
async function sendSMSReminder(
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { sendSMSWithLogging } = await import('@/lib/sms/smsService')

    const result = await sendSMSWithLogging({
      phoneNumber: phone,
      message: message,
    })

    return {
      success: result.success,
      error: result.error,
      messageId: result.messageId,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error sending SMS reminder:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Format currency for SMS
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format date for SMS
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Generate rent payment reminder message
 */
function generateRentReminderMessage(
  amount: number,
  dueDate: string,
  isOverdue: boolean
): string {
  const formattedAmount = formatCurrency(amount)
  const formattedDate = formatDate(dueDate)

  if (isOverdue) {
    return `RentalKenya: Your rent payment of ${formattedAmount} is OVERDUE (due ${formattedDate}). Please make payment immediately to avoid penalties.`
  } else {
    return `RentalKenya: Reminder - Your rent payment of ${formattedAmount} is due on ${formattedDate}. Please make payment to avoid late fees.`
  }
}

/**
 * Send rent payment reminders
 * Called on 1st, 5th, and 7th of month
 */
/**
 * Send rent payment reminders
 * Called on 26th (upcoming), 1st (due), and 5th (overdue)
 */
export async function sendRentPaymentReminders(
  dayOfMonth: 26 | 1 | 5
): Promise<SendReminderResult> {
  try {
    const supabase = await createClient()
    let remindersSent = 0
    const errors: string[] = []

    // Logic for the 26th: Upcoming Rent Reminder
    if (dayOfMonth === 26) {
      // 1. Calculate next month
      const today = new Date()
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const nextMonthStr = nextMonthDate.toISOString().slice(0, 7) // YYYY-MM

      // 2. Find active leases where rent is NOT paid for next month
      // We check if rent_paid_until is NULL or less than the end of next month
      // Actually, simpler: check if rent_paid_until is NULL or < nextMonthDate
      // If rent_paid_until >= nextMonthDate, it means they paid for next month.

      const { data: leases, error: leaseError } = await supabase
        .from('leases')
        .select(`
          id,
          tenant_user_id,
          rent_paid_until,
          monthly_rent,
          user_profiles (
            phone_number
          )
        `)
        .eq('status', 'active')

      if (leaseError || !leases) {
        throw new Error(leaseError?.message || 'Failed to fetch leases')
      }

      for (const lease of leases) {
        try {
          const profile = lease.user_profiles as { phone_number: string } | null
          if (!profile?.phone_number) continue

          const paidUntil = lease.rent_paid_until ? new Date(lease.rent_paid_until) : null

          // Check if covered
          // If paidUntil is null, they definitely haven't paid
          // If paidUntil < nextMonthDate, they haven't paid for next month fully
          // Example: Paid until Dec 31. Next month is Jan 1. 
          // paidUntil (Dec 31) < nextMonthDate (Jan 1) => True, send reminder.

          const isCovered = paidUntil && paidUntil >= nextMonthDate

          if (!isCovered) {
            const message = `RentalKenya: Reminder - Your rent of ${formatCurrency(Number(lease.monthly_rent))} for next month is due on the 1st. Please plan accordingly.`

            // Send reminder
            const reminderCreated = await createReminder({
              user_id: lease.tenant_user_id,
              related_entity_type: 'lease', // Linked to lease since invoice doesn't exist yet
              related_entity_id: lease.id,
              reminder_type: 'rent_payment',
              message: message,
              scheduled_for: new Date().toISOString(),
            })

            if (reminderCreated) {
              const smsResult = await sendSMSReminder(profile.phone_number, message)
              if (smsResult.success) {
                remindersSent++
                // Update status (simplified for brevity, similar to below)
                await supabase
                  .from('reminders')
                  .update({
                    sent_at: new Date().toISOString(),
                    delivery_status: 'sent',
                    sent_via_africas_talking: true,
                  })
                  .match({
                    user_id: lease.tenant_user_id,
                    related_entity_id: lease.id,
                    reminder_type: 'rent_payment',
                    delivery_status: 'pending'
                  })
              } else {
                errors.push(`Failed to send SMS to ${profile.phone_number}: ${smsResult.error}`)
              }
            }
          }
        } catch (err) {
          console.error(`Error processing lease ${lease.id}`, err)
        }
      }

      return {
        success: true,
        message: `Sent ${remindersSent} upcoming rent reminders`,
        reminders_sent: remindersSent,
      }
    }

    // Logic for 1st and 5th: Due and Overdue Reminders
    // These rely on generated invoices
    const unpaidInvoices = await getUnpaidInvoicesForReminder()

    if (unpaidInvoices.length === 0) {
      return {
        success: true,
        message: 'No unpaid invoices found',
        reminders_sent: 0,
      }
    }

    for (const invoice of unpaidInvoices) {
      try {
        if (!invoice.tenant_phone) {
          errors.push(`No phone number for invoice ${invoice.id}`)
          continue
        }

        const today = new Date()
        const dueDate = new Date(invoice.due_date)
        const isOverdue = dueDate < today

        // Only send reminders for rent invoices
        // Filter by invoice type if needed (for now, assume all are rent)
        const message = generateRentReminderMessage(
          invoice.amount,
          invoice.due_date,
          isOverdue
        )

        // Create reminder record first
        const reminderCreated = await createReminder({
          user_id: invoice.tenant_user_id,
          related_entity_type: 'payment',
          related_entity_id: invoice.id,
          reminder_type: 'rent_payment',
          message: message,
          scheduled_for: new Date().toISOString(),
        })

        if (reminderCreated) {
          // Get the created reminder ID
          const { data: latestReminder } = await supabase
            .from('reminders')
            .select('id')
            .eq('user_id', invoice.tenant_user_id)
            .eq('related_entity_id', invoice.id)
            .eq('reminder_type', 'rent_payment')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          // Send SMS with reminder ID
          const smsResult = await sendSMSReminder(invoice.tenant_phone, message)

          if (smsResult.success) {
            // Update reminder status to sent
            if (latestReminder) {
              await supabase
                .from('reminders')
                .update({
                  sent_at: new Date().toISOString(),
                  delivery_status: 'sent',
                  sent_via_africas_talking: true,
                })
                .eq('id', latestReminder.id)
            }

            remindersSent++
          } else {
            // Update reminder as failed
            if (latestReminder) {
              await supabase
                .from('reminders')
                .update({
                  delivery_status: 'failed',
                  sent_via_africas_talking: false,
                })
                .eq('id', latestReminder.id)
            }

            errors.push(
              `Failed to send SMS to ${invoice.tenant_phone}: ${smsResult.error}`
            )
          }
        }
      } catch (error) {
        const err = error as Error
        errors.push(`Error processing invoice ${invoice.id}: ${err.message}`)
      }
    }

    return {
      success: true,
      message: `Sent ${remindersSent} reminders`,
      reminders_sent: remindersSent,
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in sendRentPaymentReminders:', err)
    return {
      success: false,
      error: err.message || 'Failed to send reminders',
    }
  }
}

/**
 * Send water bill reminders to caretakers
 */
export async function sendWaterBillReminders(): Promise<SendReminderResult> {
  try {
    // TODO: Implement water bill reminders to caretakers
    // This would notify caretakers to add water bills for the month

    return {
      success: true,
      message: 'Water bill reminders sent',
      reminders_sent: 0,
    }
  } catch (error) {
    const err = error as Error
    return {
      success: false,
      error: err.message || 'Failed to send water bill reminders',
    }
  }
}
