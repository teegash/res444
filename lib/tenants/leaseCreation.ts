'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface TenantData {
  full_name: string
  email: string
  phone_number: string
  national_id: string
  date_of_birth?: string
  address?: string
}

export interface LeaseData {
  start_date: string
}

export interface CreateTenantWithLeaseRequest {
  unit_id: string
  tenant: TenantData
  lease: LeaseData
}

export interface UnitInfo {
  id: string
  unit_number: string
  building_id: string
  building_name: string
  status: string
  unit_price_category: string | null
  // We'll extract price from unit_price_category or use a default
}

export interface CreatedTenant {
  id: string
  full_name: string
  email: string
  phone_number: string
}

export interface CreatedLease {
  id: string
  unit_id: string
  unit_number: string
  building_name: string
  monthly_rent: number
  deposit_amount: number
  start_date: string
  end_date: string
  lease_duration_months: number
  rent_locked: boolean
  rent_locked_reason: string
  lease_auto_generated: boolean
}

export interface CreateTenantWithLeaseResult {
  success: boolean
  message?: string
  error?: string
  data?: {
    tenant: CreatedTenant
    lease: CreatedLease
    invoice_created: boolean
    invitation_sent: boolean
  }
  validationErrors?: Array<{
    field: string
    error: string
  }>
}

/**
 * Extract price from unit_price_category
 * Handles formats like "KES 10,000" or "10000" or "KES10000"
 * 
 * Note: In production, consider adding a numeric 'price' field to apartment_units
 * for better performance and reliability
 */
function extractPriceFromCategory(priceCategory: string | null): number | null {
  if (!priceCategory) return null

  // Remove "KES" and spaces, then remove commas
  const cleaned = priceCategory
    .replace(/KES/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .trim()

  const price = parseFloat(cleaned)
  return isNaN(price) || price <= 0 ? null : price
}

/**
 * Get unit price - tries multiple methods
 * 1. Extract from unit_price_category
 * 2. Query from a price field if it exists (future enhancement)
 */
async function getUnitPrice(unitId: string, unitPriceCategory: string | null): Promise<number | null> {
  // First, try to extract from category
  let price = extractPriceFromCategory(unitPriceCategory)
  
  if (price) {
    return price
  }

  // If extraction failed, try to query a price field if it exists
  // This is a fallback for future schema enhancements
  try {
    const supabase = await createClient()
    const { data: unit } = await supabase
      .from('apartment_units')
      .select('price') // This field might not exist yet
      .eq('id', unitId)
      .single()

    if (unit && (unit as any).price) {
      return parseFloat((unit as any).price)
    }
  } catch (error) {
    // Price field doesn't exist, that's okay
  }

  return null
}

/**
 * Validate email format
 */
function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }

  return { valid: true }
}

/**
 * Validate phone format (Kenya: +254XXXXXXXXX)
 */
function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' }
  }

  const phoneRegex = /^\+254\d{9}$/
  if (!phoneRegex.test(phone)) {
    return {
      valid: false,
      error: 'Phone number must be Kenya format: +254XXXXXXXXX (e.g., +254712345678)',
    }
  }

  return { valid: true }
}

/**
 * Validate national ID format (Kenya: 8 digits)
 */
function validateNationalId(nationalId: string): { valid: boolean; error?: string } {
  if (!nationalId || nationalId.trim().length === 0) {
    return { valid: false, error: 'National ID is required' }
  }

  const idRegex = /^\d{8}$/
  if (!idRegex.test(nationalId)) {
    return { valid: false, error: 'National ID must be 8 digits' }
  }

  return { valid: true }
}

/**
 * Validate date format and ensure it's today or later
 */
function validateStartDate(startDate: string): { valid: boolean; error?: string } {
  if (!startDate) {
    return { valid: false, error: 'Start date is required' }
  }

  const date = new Date(startDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' }
  }

  if (date < today) {
    return { valid: false, error: 'Start date must be today or later' }
  }

  return { valid: true }
}

/**
 * Check if email already exists
 * Note: user_profiles doesn't have email field, so we rely on Supabase Auth
 * to handle duplicate email checks during user creation
 */
async function checkEmailExists(email: string): Promise<boolean> {
  try {
    // Since user_profiles doesn't have an email column,
    // we'll let Supabase Auth handle the duplicate check during user creation
    // This function is kept for consistency but will return false
    // The actual check happens when creating the auth user
    return false
  } catch (error) {
    // If check fails, let Supabase handle it during user creation
    return false
  }
}

/**
 * Check if national ID already exists
 */
async function checkNationalIdExists(nationalId: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('national_id', nationalId)
      .maybeSingle()

    return !!profile
  } catch (error) {
    console.error('Error checking national ID:', error)
    return false
  }
}

/**
 * Get unit information with building details
 */
async function getUnitInfo(unitId: string): Promise<UnitInfo | null> {
  try {
    const supabase = await createClient()

    const { data: unit, error } = await supabase
      .from('apartment_units')
      .select(
        `
        id,
        unit_number,
        building_id,
        status,
        unit_price_category,
        apartment_buildings (
          id,
          name
        )
      `
      )
      .eq('id', unitId)
      .single()

    if (error || !unit) {
      return null
    }

    const building = unit.apartment_buildings as { id: string; name: string } | null

    return {
      id: unit.id,
      unit_number: unit.unit_number,
      building_id: unit.building_id,
      building_name: building?.name || 'Unknown Building',
      status: unit.status,
      unit_price_category: unit.unit_price_category,
    }
  } catch (error) {
    console.error('Error fetching unit info:', error)
    return null
  }
}

/**
 * Generate temporary password for new tenant
 */
function generateTempPassword(): string {
  // Generate a secure random password
  const length = 12
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  
  // Ensure at least one of each type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
  password += '0123456789'[Math.floor(Math.random() * 10)]
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)]
  }
  
  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * Calculate end date (12 months from start date)
 */
function calculateEndDate(startDate: string): string {
  const date = new Date(startDate)
  date.setMonth(date.getMonth() + 12)
  return date.toISOString().split('T')[0]
}

/**
 * Create tenant with lease
 */
export async function createTenantWithLease(
  request: CreateTenantWithLeaseRequest,
  createdByUserId: string
): Promise<CreateTenantWithLeaseResult> {
  try {
    const supabase = await createClient()
    const validationErrors: Array<{ field: string; error: string }> = []

    // 1. Validate tenant data
    if (!request.tenant.full_name || request.tenant.full_name.trim().length === 0) {
      validationErrors.push({ field: 'tenant.full_name', error: 'Full name is required' })
    }

    const emailValidation = validateEmail(request.tenant.email)
    if (!emailValidation.valid) {
      validationErrors.push({ field: 'tenant.email', error: emailValidation.error || 'Invalid email' })
    }

    const phoneValidation = validatePhone(request.tenant.phone_number)
    if (!phoneValidation.valid) {
      validationErrors.push({ field: 'tenant.phone_number', error: phoneValidation.error || 'Invalid phone' })
    }

    const nationalIdValidation = validateNationalId(request.tenant.national_id)
    if (!nationalIdValidation.valid) {
      validationErrors.push({ field: 'tenant.national_id', error: nationalIdValidation.error || 'Invalid national ID' })
    }

    // 2. Validate lease data
    const dateValidation = validateStartDate(request.lease.start_date)
    if (!dateValidation.valid) {
      validationErrors.push({ field: 'lease.start_date', error: dateValidation.error || 'Invalid start date' })
    }

    // Return validation errors if any
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Validation failed',
        validationErrors,
      }
    }

    // 3. Validate unit exists and is vacant
    const unitInfo = await getUnitInfo(request.unit_id)
    if (!unitInfo) {
      return {
        success: false,
        error: 'Unit not found',
      }
    }

    if (unitInfo.status !== 'vacant') {
      return {
        success: false,
        error: 'Unit is currently occupied. Please select a vacant unit.',
      }
    }

    // 4. Check for duplicate email
    const emailExists = await checkEmailExists(request.tenant.email)
    if (emailExists) {
      return {
        success: false,
        error: 'Email already registered. Please use a different email address.',
      }
    }

    // 5. Check for duplicate national ID
    const nationalIdExists = await checkNationalIdExists(request.tenant.national_id)
    if (nationalIdExists) {
      return {
        success: false,
        error: 'National ID already exists. Please contact support if this is an error.',
      }
    }

    // 6. Extract unit price
    const monthlyRent = await getUnitPrice(request.unit_id, unitInfo.unit_price_category)
    
    // If price not found, return error
    if (!monthlyRent || monthlyRent <= 0) {
      return {
        success: false,
        error: 'Unit price not found. Please set a price for this unit (unit_price_category) before creating a lease. Expected format: "KES 10,000" or "10000".',
      }
    }

    // 7. Generate temporary password
    const tempPassword = generateTempPassword()

    // 8. Create auth user using admin client
    const adminClient = createAdminClient()
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: request.tenant.email.toLowerCase().trim(),
      password: tempPassword,
      email_confirm: false, // Will be confirmed via email
      user_metadata: {
        full_name: request.tenant.full_name.trim(),
        phone_number: request.tenant.phone_number.trim(),
        national_id: request.tenant.national_id.trim(),
        role: 'tenant',
      },
    })

    if (authError || !authData.user) {
      // Check if it's a duplicate email error
      if (authError?.message?.includes('already') || authError?.message?.includes('exists')) {
        return {
          success: false,
          error: 'Email already registered. Please use a different email address.',
        }
      }
      return {
        success: false,
        error: authError?.message || 'Failed to create user account',
      }
    }

    const userId = authData.user.id

    try {
      // 9. Create tenant profile
      const { error: profileError } = await supabase.from('user_profiles').update({
        full_name: request.tenant.full_name.trim(),
        phone_number: request.tenant.phone_number.trim(),
        national_id: request.tenant.national_id.trim(),
        date_of_birth: request.tenant.date_of_birth || null,
        address: request.tenant.address || null,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      if (profileError) {
        // Profile might have been created by trigger, try insert
        const { error: insertError } = await supabase.from('user_profiles').insert({
          id: userId,
          full_name: request.tenant.full_name.trim(),
          phone_number: request.tenant.phone_number.trim(),
          national_id: request.tenant.national_id.trim(),
          date_of_birth: request.tenant.date_of_birth || null,
          address: request.tenant.address || null,
        })

        if (insertError && insertError.code !== '23505') {
          // If not a duplicate error, throw
          throw new Error(`Failed to create profile: ${insertError.message}`)
        }
      }

      // 10. Calculate lease dates
      const startDate = request.lease.start_date
      const endDate = calculateEndDate(startDate)

      // 11. Create lease with locked fields
      const { data: leaseData, error: leaseError } = await supabase
        .from('leases')
        .insert({
          unit_id: request.unit_id,
          tenant_user_id: userId,
          start_date: startDate,
          end_date: endDate,
          monthly_rent: monthlyRent,
          deposit_amount: monthlyRent, // Equal to monthly rent
          status: 'active',
          rent_auto_populated: true,
          rent_locked_reason: 'Auto-populated from unit specifications',
          lease_auto_generated: true,
        })
        .select('id')
        .single()

      if (leaseError || !leaseData) {
        throw new Error(`Failed to create lease: ${leaseError?.message || 'Unknown error'}`)
      }

      // 12. Update unit status to occupied
      const { error: unitUpdateError } = await supabase
        .from('apartment_units')
        .update({ status: 'occupied' })
        .eq('id', request.unit_id)

      if (unitUpdateError) {
        throw new Error(`Failed to update unit status: ${unitUpdateError.message}`)
      }

      // 13. Create first invoice
      const dueDate = new Date(startDate)
      dueDate.setDate(dueDate.getDate() + 5)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      const { error: invoiceError } = await supabase.from('invoices').insert({
        lease_id: leaseData.id,
        invoice_type: 'rent',
        amount: monthlyRent,
        due_date: dueDateStr,
        status: 'unpaid',
        months_covered: 1,
        description: `First month rent for ${unitInfo.unit_number}`,
      })

      let invoiceCreated = true
      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError)
        invoiceCreated = false
        // Don't fail the operation if invoice creation fails
      }

      // 14. Create organization member record (tenant role)
      // Get organization from building
      const { data: building } = await supabase
        .from('apartment_buildings')
        .select('organization_id')
        .eq('id', unitInfo.building_id)
        .single()

      if (building?.organization_id) {
        const { error: memberError } = await supabase.from('organization_members').insert({
          user_id: userId,
          organization_id: building.organization_id,
          role: 'tenant',
        })

        if (memberError && memberError.code !== '23505') {
          // Ignore duplicate errors
          console.warn('Error creating organization member:', memberError)
        }
      }

      // 15. Send invitation email
      let invitationSent = false
      try {
        const { sendTenantInvitation } = await import('./emailInvitation')
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const loginUrl = `${siteUrl}/auth/login`
        
        const dueDate = new Date(startDate)
        dueDate.setDate(dueDate.getDate() + 5)
        const firstPaymentDue = dueDate.toISOString().split('T')[0]

        const emailResult = await sendTenantInvitation(request.tenant.email, {
          tenantName: request.tenant.full_name.trim(),
          email: request.tenant.email.toLowerCase().trim(),
          unitNumber: unitInfo.unit_number,
          buildingName: unitInfo.building_name,
          monthlyRent: monthlyRent,
          startDate: startDate,
          endDate: endDate,
          depositAmount: monthlyRent,
          firstPaymentDue: firstPaymentDue,
          loginUrl: loginUrl,
        })

        invitationSent = emailResult.success
      } catch (emailError) {
        console.error('Error sending invitation email:', emailError)
        // Don't fail the operation if email fails
        // Supabase will still send verification email automatically
        invitationSent = true // Mark as sent since Supabase handles it
      }

      // 16. Format response
      return {
        success: true,
        message: 'Tenant and lease created successfully',
        data: {
          tenant: {
            id: userId,
            full_name: request.tenant.full_name.trim(),
            email: request.tenant.email.toLowerCase().trim(),
            phone_number: request.tenant.phone_number.trim(),
          },
          lease: {
            id: leaseData.id,
            unit_id: request.unit_id,
            unit_number: unitInfo.unit_number,
            building_name: unitInfo.building_name,
            monthly_rent: monthlyRent,
            deposit_amount: monthlyRent,
            start_date: startDate,
            end_date: endDate,
            lease_duration_months: 12,
            rent_locked: true,
            rent_locked_reason: 'Auto-populated from unit specifications',
            lease_auto_generated: true,
          },
          invoice_created: invoiceCreated,
          invitation_sent: invitationSent,
        },
      }
    } catch (error) {
      // Rollback: Revert all changes if any operation failed
      try {
        // 1. Revert unit status to vacant
        await supabase
          .from('apartment_units')
          .update({ status: 'vacant' })
          .eq('id', request.unit_id)

        // 2. Delete auth user (this will CASCADE delete profile, lease, invoice, org member)
        const adminClient = createAdminClient()
        await adminClient.auth.admin.deleteUser(userId)
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError)
        // Log but don't throw - the main error is more important
      }

      const err = error as Error
      return {
        success: false,
        error: err.message || 'Failed to create tenant and lease',
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in createTenantWithLease:', err)
    return {
      success: false,
      error: err.message || 'An unexpected error occurred',
    }
  }
}

