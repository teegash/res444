'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invoiceStatusToBoolean } from '@/lib/invoices/status-utils'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export interface InvoiceData {
  id: string
  lease_id: string
  invoice_type: 'rent' | 'water'
  amount: number
  due_date: string
  status: boolean
  months_covered: number
  description: string | null
  created_at: string
}

export interface LeaseInfo {
  id: string
  unit_id: string
  tenant_user_id: string
  monthly_rent: number
  status: string
  start_date: string
  end_date: string | null
}

export interface WaterBillInfo {
  id: string
  unit_id: string
  billing_month: string
  amount: number
  status: string
  added_to_invoice_id: string | null
}

export interface GenerateMonthlyInvoicesResult {
  success: boolean
  message?: string
  error?: string
  data?: {
    invoices_created: number
    rent_invoices: number
    water_invoices: number
    combined_invoices: number
    total_amount: number
    leases_processed: number
    water_bills_included: number
    water_bills_separate: number
  }
}

type InvoiceSupabaseClient = SupabaseClient<Database>

function getInvoiceClient(client?: InvoiceSupabaseClient): InvoiceSupabaseClient {
  return client ?? createAdminClient()
}

/**
 * Calculate due date (5 days from today)
 */
function calculateDueDate(): string {
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 5)
  return dueDate.toISOString().split('T')[0]
}

/**
 * Check if date is within first 5 days of month
 */
function isWithinFirst5Days(date: Date): boolean {
  return date.getDate() <= 5
}

/**
 * Get all active leases
 */
async function getActiveLeases(): Promise<LeaseInfo[]> {
  try {
    const supabase = await createClient()

    const { data: leases, error } = await supabase
      .from('leases')
      .select('id, unit_id, tenant_user_id, monthly_rent, status, start_date, end_date')
      .eq('status', 'active')

    if (error) {
      console.error('Error fetching active leases:', error)
      return []
    }

    return (leases || []) as LeaseInfo[]
  } catch (error) {
    console.error('Error in getActiveLeases:', error)
    return []
  }
}

/**
 * Check if invoice already exists for lease and month
 */
async function invoiceExistsForMonth(
  leaseId: string,
  invoiceType: 'rent' | 'water',
  month: string
): Promise<boolean> {
  try {
    const supabase = await createClient()

    const monthStart = new Date(month)
    monthStart.setDate(1)
    const monthEnd = new Date(monthStart)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0) // Last day of month

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('lease_id', leaseId)
      .eq('invoice_type', invoiceType)
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString())
      .maybeSingle()

    return !!invoices
  } catch (error) {
    console.error('Error checking invoice existence:', error)
    return false
  }
}

/**
 * Get pending water bills for a unit that haven't been invoiced
 */
async function getPendingWaterBills(
  unitId: string,
  currentMonth: string
): Promise<WaterBillInfo[]> {
  try {
    const supabase = await createClient()

    // Get water bills for current month that are pending
    const monthStart = new Date(currentMonth)
    monthStart.setDate(1)
    const monthEnd = new Date(monthStart)
    monthEnd.setMonth(monthEnd.getMonth() + 1)

    const { data: waterBills, error } = await supabase
      .from('water_bills')
      .select('id, unit_id, billing_month, amount, status, added_to_invoice_id')
      .eq('unit_id', unitId)
      .eq('status', 'pending')
      .gte('billing_month', monthStart.toISOString().split('T')[0])
      .lt('billing_month', monthEnd.toISOString().split('T')[0])

    if (error) {
      console.error('Error fetching water bills:', error)
      return []
    }

    return (waterBills || []) as WaterBillInfo[]
  } catch (error) {
    console.error('Error in getPendingWaterBills:', error)
    return []
  }
}

/**
 * Create rent invoice
 */
async function createRentInvoice(
  leaseId: string,
  monthlyRent: number,
  dueDate: string,
  description?: string
): Promise<string | null> {
  try {
    const supabase = await createClient()

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        lease_id: leaseId,
        invoice_type: 'rent',
        amount: monthlyRent,
        due_date: dueDate,
        status: false,
        months_covered: 1,
        description: description || `Monthly rent invoice`,
      })
      .select('id')
      .single()

    if (error || !invoice) {
      console.error('Error creating rent invoice:', error)
      return null
    }

    return invoice.id
  } catch (error) {
    console.error('Error in createRentInvoice:', error)
    return null
  }
}

/**
 * Create water invoice
 */
async function createWaterInvoice(
  leaseId: string,
  amount: number,
  dueDate: string,
  description?: string
): Promise<string | null> {
  try {
    const supabase = await createClient()

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        lease_id: leaseId,
        invoice_type: 'water',
        amount: amount,
        due_date: dueDate,
        status: false,
        months_covered: 1,
        description: description || `Water bill invoice`,
      })
      .select('id')
      .single()

    if (error || !invoice) {
      console.error('Error creating water invoice:', error)
      return null
    }

    return invoice.id
  } catch (error) {
    console.error('Error in createWaterInvoice:', error)
    return null
  }
}

/**
 * Update water bill status to added_to_invoice
 */
async function markWaterBillAsAdded(
  waterBillId: string,
  invoiceId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('water_bills')
      .update({
        status: 'added_to_invoice',
        added_to_invoice_id: invoiceId,
        added_by: userId,
        added_at: new Date().toISOString(),
      })
      .eq('id', waterBillId)

    if (error) {
      console.error('Error updating water bill:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in markWaterBillAsAdded:', error)
    return false
  }
}

/**
 * Generate monthly invoices for all active leases
 */
export async function generateMonthlyInvoices(
  userId: string,
  targetMonth?: string
): Promise<GenerateMonthlyInvoicesResult> {
  try {
    const supabase = await createClient()

    // Use provided month or current month
    const currentDate = targetMonth ? new Date(targetMonth) : new Date()
    const currentMonth = currentDate.toISOString().split('T')[0].substring(0, 7) // YYYY-MM
    const isWithin5Days = isWithinFirst5Days(currentDate)

    // Get all active leases
    const activeLeases = await getActiveLeases()

    if (activeLeases.length === 0) {
      return {
        success: true,
        message: 'No active leases found',
        data: {
          invoices_created: 0,
          rent_invoices: 0,
          water_invoices: 0,
          combined_invoices: 0,
          total_amount: 0,
          leases_processed: 0,
          water_bills_included: 0,
          water_bills_separate: 0,
        },
      }
    }

    let rentInvoicesCreated = 0
    let waterInvoicesCreated = 0
    let combinedInvoicesCreated = 0
    let waterBillsIncluded = 0
    let waterBillsSeparate = 0
    let totalAmount = 0
    const errors: string[] = []

    const dueDate = calculateDueDate()

    // Process each lease
    for (const lease of activeLeases) {
      try {
        // Check if rent invoice already exists for this month
        const rentInvoiceExists = await invoiceExistsForMonth(
          lease.id,
          'rent',
          currentMonth
        )

        if (!rentInvoiceExists) {
          // Get pending water bills for this unit
          const pendingWaterBills = await getPendingWaterBills(
            lease.unit_id,
            currentMonth
          )

          const totalWaterAmount = pendingWaterBills.reduce(
            (sum, bill) => sum + parseFloat(bill.amount.toString()),
            0
          )

          // Create rent invoice
          const rentInvoiceId = await createRentInvoice(
            lease.id,
            parseFloat(lease.monthly_rent.toString()),
            dueDate,
            `Monthly rent for ${currentMonth}`
          )

          if (rentInvoiceId) {
            // Handle water bills
            if (pendingWaterBills.length > 0 && isWithin5Days) {
              // Include water bills in rent invoice (update rent invoice amount)
              const combinedAmount =
                parseFloat(lease.monthly_rent.toString()) + totalWaterAmount

              // Update rent invoice to include water
              const { error: updateError } = await supabase
                .from('invoices')
                .update({
                  amount: combinedAmount,
                  description: `Monthly rent + water bill for ${currentMonth}`,
                })
                .eq('id', rentInvoiceId)

              if (!updateError) {
                // Mark water bills as added to invoice
                for (const waterBill of pendingWaterBills) {
                  await markWaterBillAsAdded(waterBill.id, rentInvoiceId, userId)
                  waterBillsIncluded++
                }
                combinedInvoicesCreated++
                totalAmount += combinedAmount // Combined amount (rent + water)
              } else {
                console.error('Error updating invoice with water:', updateError)
                // Fallback: count as regular rent invoice
                rentInvoicesCreated++
                totalAmount += parseFloat(lease.monthly_rent.toString())
              }
            } else {
              // Regular rent invoice (no water or after 5th)
              rentInvoicesCreated++
              totalAmount += parseFloat(lease.monthly_rent.toString())

              // Create separate water invoices if after 5th
              if (pendingWaterBills.length > 0 && !isWithin5Days) {
                for (const waterBill of pendingWaterBills) {
                  const waterInvoiceId = await createWaterInvoice(
                    lease.id,
                    parseFloat(waterBill.amount.toString()),
                    dueDate,
                    `Water bill for ${currentMonth}`
                  )

                  if (waterInvoiceId) {
                    await markWaterBillAsAdded(waterBill.id, waterInvoiceId, userId)
                    waterInvoicesCreated++
                    waterBillsSeparate++
                    totalAmount += parseFloat(waterBill.amount.toString())
                  }
                }
              }
            }
          } else {
            errors.push(`Failed to create rent invoice for lease ${lease.id}`)
          }
        }
      } catch (error) {
        const err = error as Error
        errors.push(`Error processing lease ${lease.id}: ${err.message}`)
        console.error(`Error processing lease ${lease.id}:`, error)
      }
    }

    return {
      success: true,
      message: `Monthly invoices generated successfully`,
      data: {
        invoices_created:
          rentInvoicesCreated + waterInvoicesCreated + combinedInvoicesCreated,
        rent_invoices: rentInvoicesCreated,
        water_invoices: waterInvoicesCreated,
        combined_invoices: combinedInvoicesCreated,
        total_amount: totalAmount,
        leases_processed: activeLeases.length,
        water_bills_included: waterBillsIncluded,
        water_bills_separate: waterBillsSeparate,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in generateMonthlyInvoices:', err)
    return {
      success: false,
      error: err.message || 'Failed to generate monthly invoices',
    }
  }
}

/**
 * Calculate invoice status based on payments
 */
export async function calculateInvoiceStatus(
  invoiceId: string,
  client?: InvoiceSupabaseClient
): Promise<boolean> {
  try {
    const supabase = getInvoiceClient(client)

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('amount, due_date, status')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return false
    }

    // Get total payments for this invoice
    const { data: payments } = await supabase
      .from('payments')
      .select('amount_paid, verified')
      .eq('invoice_id', invoiceId)
      .eq('verified', true)

    const totalPaid = (payments || []).reduce(
      (sum, payment) => sum + parseFloat(payment.amount_paid.toString()),
      0
    )

    const invoiceAmount = parseFloat(invoice.amount.toString())
    return totalPaid >= invoiceAmount
  } catch (error) {
    console.error('Error calculating invoice status:', error)
    return false
  }
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  client?: InvoiceSupabaseClient
): Promise<boolean> {
  try {
    const supabase = getInvoiceClient(client)

    const newStatus = await calculateInvoiceStatus(invoiceId, supabase)

    const { error } = await supabase
      .from('invoices')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    if (error) {
      console.error('Error updating invoice status:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in updateInvoiceStatus:', error)
    return false
  }
}

/**
 * Mark all overdue invoices
 */
export async function markOverdueInvoices(): Promise<{
  success: boolean
  overdue_count: number
}> {
  try {
    const supabase = await createClient()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get all unpaid invoices past due date
    const { data: overdueInvoices, error } = await supabase
      .from('invoices')
      .select('id')
      .eq('status', false)
      .lt('due_date', today.toISOString().split('T')[0])

    if (error) {
      console.error('Error fetching overdue invoices:', error)
      return { success: false, overdue_count: 0 }
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return { success: true, overdue_count: 0 }
    }

    return {
      success: true,
      overdue_count: overdueInvoices.length,
    }
  } catch (error) {
    console.error('Error in markOverdueInvoices:', error)
    return { success: false, overdue_count: 0 }
  }
}
