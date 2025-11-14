'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthError } from '@/lib/supabase/types'

export type UserRole = 'admin' | 'manager' | 'caretaker' | 'tenant'

export interface RegisterInput {
  email: string
  password: string
  full_name: string
  phone: string
  role: UserRole
  organization_id?: string // For managers/caretakers - existing organization
  building_id?: string // For caretakers - the building they'll manage
  national_id?: string // Optional - national ID number
  address?: string // Optional - user address
  date_of_birth?: string // Optional - date of birth (YYYY-MM-DD format)
  organization?: {
    name: string
    email: string
    phone: string
    location: string
    registration_number: string
    logo_url?: string | null
  } // For owners - organization to create
}

export interface RegisterResult {
  success: boolean
  message?: string
  error?: string
  data?: {
    user_id: string
    email: string
    role: UserRole // Include role in response
    profile_created: boolean
    verification_email_sent: boolean
    organization_member_created: boolean
  }
}

/**
 * Validates email format
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
 * Validates phone number format for Kenya (+254XXXXXXXXX)
 */
function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' }
  }

  // Kenya phone format: +254 followed by 9 digits
  const phoneRegex = /^\+254\d{9}$/
  if (!phoneRegex.test(phone)) {
    return {
      valid: false,
      error: 'Invalid phone format. Use Kenya format: +254XXXXXXXXX (e.g., +254712345678)',
    }
  }

  return { valid: true }
}

/**
 * Validates password strength
 * Requirements: min 8 chars, at least one uppercase, at least one number
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required' }
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' }
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' }
  }

  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }

  return { valid: true }
}

/**
 * Validates full name
 */
function validateFullName(fullName: string): { valid: boolean; error?: string } {
  if (!fullName || fullName.trim().length === 0) {
    return { valid: false, error: 'Full name is required' }
  }

  if (fullName.trim().length < 2) {
    return { valid: false, error: 'Full name must be at least 2 characters long' }
  }

  return { valid: true }
}

/**
 * Validates user role
 */
function validateRole(role: string): { valid: boolean; error?: string } {
  const validRoles: UserRole[] = ['admin', 'manager', 'caretaker', 'tenant']
  if (!validRoles.includes(role as UserRole)) {
    return {
      valid: false,
      error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
    }
  }

  return { valid: true }
}

/**
 * Checks if email already exists in Supabase Auth
 * Note: We'll let Supabase handle the duplicate check during signup
 * Since user_profiles doesn't have email column, we rely on Supabase auth
 */
async function checkEmailExists(email: string): Promise<boolean> {
  try {
    // Since user_profiles table doesn't have an email column,
    // we rely on Supabase auth to handle duplicate email checks
    // This function is kept for consistency but will let Supabase handle it
    return false
  } catch (error) {
    // If check fails, let Supabase handle the duplicate email error during signup
    return false
  }
}

/**
 * Creates user profile in user_profiles table
 * Handles the case where a database trigger might have already created the profile
 * Matches your schema: phone_number (not phone), no email column
 * Populates all available fields from registration form
 */
async function createUserProfile(
  userId: string,
  fullName: string,
  phone: string,
  nationalId?: string,
  address?: string,
  dateOfBirth?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Prepare profile data object with all available fields
    const profileData: {
      id: string
      full_name: string
      phone_number: string
      national_id?: string
      address?: string
      date_of_birth?: string
      updated_at?: string
    } = {
      id: userId,
      full_name: fullName.trim(),
      phone_number: phone.trim(),
    }

    // Add optional fields if provided
    if (nationalId && nationalId.trim()) {
      profileData.national_id = nationalId.trim()
    }
    if (address && address.trim()) {
      profileData.address = address.trim()
    }
    if (dateOfBirth && dateOfBirth.trim()) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (dateRegex.test(dateOfBirth.trim())) {
        profileData.date_of_birth = dateOfBirth.trim()
      } else {
        console.warn('Invalid date_of_birth format, skipping:', dateOfBirth)
      }
    }

    // First, check if profile already exists (might have been created by trigger)
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfile) {
      // Profile exists (likely created by trigger), update it with our data
      const updateData = { ...profileData }
      delete updateData.id // Don't include id in update
      updateData.updated_at = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)

      if (updateError) {
        // If update fails, check if it's a table structure issue
        if (updateError.code === '42P01' || updateError.message.includes('does not exist')) {
          console.warn('user_profiles table does not exist. Profile creation skipped.')
          return { success: false, error: 'Table does not exist' }
        }
        
        // Handle unique constraint violation for national_id
        if (updateError.code === '23505' && updateError.message.includes('national_id')) {
          return { success: false, error: 'National ID already exists. Please use a different ID.' }
        }
        
        return { success: false, error: updateError.message }
      }

      return { success: true }
    }

    // Profile doesn't exist, create it
    const { error } = await supabase.from('user_profiles').insert(profileData)

    if (error) {
      // If error is due to duplicate (race condition with trigger)
      if (error.code === '23505') {
        // Check if it's a national_id duplicate
        if (error.message.includes('national_id')) {
          return { success: false, error: 'National ID already exists. Please use a different ID.' }
        }
        
        // Profile was created between our check and insert, update it
        const updateData = { ...profileData }
        delete updateData.id // Don't include id in update
        updateData.updated_at = new Date().toISOString()
        
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update(updateData)
          .eq('id', userId)

        if (updateError) {
          return { success: false, error: updateError.message }
        }

        return { success: true }
      }

      // Handle unique constraint violation for national_id
      if (error.code === '23505' && error.message.includes('national_id')) {
        return { success: false, error: 'National ID already exists. Please use a different ID.' }
      }

      // Check if table doesn't exist
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.warn('user_profiles table does not exist. Profile creation skipped.')
        return { success: false, error: 'Table does not exist' }
      }

      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    const err = error as Error
    
    // Check if it's a table doesn't exist error
    if (err.message.includes('does not exist') || err.message.includes('relation')) {
      console.warn('user_profiles table does not exist. Profile creation skipped.')
      return { success: false, error: 'Table does not exist' }
    }

    return { success: false, error: err.message || 'Failed to create user profile' }
  }
}

/**
 * Creates organization member record
 * Matches your schema: requires organization_id, uses joined_at (not created_at/updated_at), no status field
 */
async function createOrganizationMember(
  userId: string,
  role: UserRole,
  organizationId?: string,
  useAdminClient: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // If no organization_id provided, skip member creation
    // User can join/create organization later
    if (!organizationId) {
      console.info('No organization_id provided. User can join organization later.')
      return { success: false, error: 'Organization ID required' }
    }

    // Use admin client during registration to bypass RLS
    const supabase = useAdminClient ? createAdminClient() : await createClient()

    // Try to create organization member
    // Matches your schema: user_id, organization_id, role, joined_at
    const { error } = await supabase.from('organization_members').insert({
      user_id: userId,
      organization_id: organizationId,
      role: role,
      joined_at: new Date().toISOString(),
    })

    if (error) {
      // Check if it's a table doesn't exist error
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        // Table doesn't exist - this is okay, might be created later
        console.warn('organization_members table does not exist. Skipping member creation.')
        return { success: false, error: 'Table does not exist' }
      }

      // Check if member already exists (unique constraint on user_id, organization_id)
      if (error.code === '23505') {
        // Unique constraint violation - member might already exist
        console.info('Organization member already exists for this user and organization.')
        return { success: true }
      }

      // Check if organization doesn't exist
      if (error.code === '23503') {
        // Foreign key violation - organization doesn't exist
        console.warn('Organization does not exist:', organizationId)
        return { success: false, error: 'Organization does not exist' }
      }

      // Other errors
      console.warn('Failed to create organization member:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    const err = error as Error
    // Don't fail registration if organization member creation fails
    console.warn('Organization member creation error:', err.message)
    return { success: false, error: err.message || 'Failed to create organization member' }
  }
}

/**
 * Main registration function
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  try {
    // Validate all inputs
    const emailValidation = validateEmail(input.email)
    if (!emailValidation.valid) {
      return {
        success: false,
        error: emailValidation.error,
      }
    }

    const phoneValidation = validatePhone(input.phone)
    if (!phoneValidation.valid) {
      return {
        success: false,
        error: phoneValidation.error,
      }
    }

    const passwordValidation = validatePassword(input.password)
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: passwordValidation.error,
      }
    }

    const fullNameValidation = validateFullName(input.full_name)
    if (!fullNameValidation.valid) {
      return {
        success: false,
        error: fullNameValidation.error,
      }
    }

    const roleValidation = validateRole(input.role)
    if (!roleValidation.valid) {
      return {
        success: false,
        error: roleValidation.error,
      }
    }

    // Check email uniqueness
    const emailExists = await checkEmailExists(input.email)
    if (emailExists) {
      return {
        success: false,
        error: 'Email already exists. Please use a different email address.',
      }
    }

    // Create Supabase client
    const supabase = await createClient()

    // Log the role being stored in user metadata
    console.log('Creating user with role:', input.role, 'for email:', input.email)

    // Create auth user with role and building_id in metadata
    const userMetadata: Record<string, any> = {
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      role: input.role, // Store role in user metadata for later use
    }
    
    // Store building_id for caretakers
    if (input.building_id) {
      userMetadata.building_id = input.building_id
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: input.email.toLowerCase().trim(),
      password: input.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
        data: userMetadata,
      },
    })

    // Verify role was set in metadata
    if (authData?.user) {
      console.log('User created. Role in metadata:', authData.user.user_metadata?.role)
    }

    if (authError) {
      // Handle specific Supabase errors
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return {
          success: false,
          error: 'Email already exists. Please use a different email address.',
        }
      }

      return {
        success: false,
        error: authError.message || 'Failed to create user account',
      }
    }

    if (!authData.user) {
      return {
        success: false,
        error: 'Failed to create user account',
      }
    }

    const userId = authData.user.id
    let profileCreated = false
    let organizationMemberCreated = false

    // Create user profile (matches your schema: phone_number, no email column)
    // Populate all available fields from registration form
    const profileResult = await createUserProfile(
      userId,
      input.full_name.trim(),
      input.phone.trim(),
      input.national_id,
      input.address,
      input.date_of_birth
    )

    if (profileResult.success) {
      profileCreated = true
    } else {
      // If table doesn't exist, that's okay - it might be created later
      // If other error, check if profile exists anyway (might have been created by trigger)
      if (!profileResult.error?.includes('does not exist')) {
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle()

        if (existingProfile) {
          profileCreated = true
        } else {
          console.warn('Profile creation warning:', profileResult.error)
        }
      } else {
        // Table doesn't exist - this is acceptable, might be created later
        console.info('user_profiles table does not exist. Profile will be created when table is available.')
      }
    }

    // Create organization if provided (for owners)
    // Use admin client to bypass RLS during registration
    let createdOrganizationId: string | undefined
    if (input.organization) {
      const adminSupabase = createAdminClient()
      const { data: organization, error: orgError } = await adminSupabase
        .from('organizations')
        .insert({
          name: input.organization.name,
          email: input.organization.email.toLowerCase(),
          phone: input.organization.phone,
          location: input.organization.location,
          registration_number: input.organization.registration_number,
          logo_url: input.organization.logo_url || null,
        })
        .select()
        .single()

      if (orgError) {
        // Handle duplicate registration number
        if (orgError.code === '23505') {
          return {
            success: false,
            error: 'Registration number already exists. Please use a different registration number.',
          }
        }

        console.error('Error creating organization:', orgError)
        return {
          success: false,
          error: orgError.message || 'Failed to create organization',
        }
      }

      if (organization) {
        createdOrganizationId = organization.id
        console.log('Organization created:', organization.id)
      }
    }

    // Create organization member
    // Use admin client during registration to bypass RLS
    const memberResult = await createOrganizationMember(
      userId,
      input.role,
      input.organization_id || createdOrganizationId, // Use created org ID for owners, or provided ID for managers/caretakers
      true // Use admin client during registration
    )
    if (memberResult.success) {
      organizationMemberCreated = true
    } else if (memberResult.error === 'Organization ID required') {
      // This should not happen for owners, but handle it
      console.error('Failed to create organization member after organization creation')
      return {
        success: false,
        error: 'Failed to link user to organization',
      }
    }

    // Determine if verification email was sent
    // Supabase sends verification email automatically if email confirmation is enabled
    const verificationEmailSent = !authData.session && authData.user

    return {
      success: true,
      message: 'User created successfully',
      data: {
        user_id: userId,
        email: input.email.toLowerCase().trim(),
        role: input.role, // Include role in response for confirmation
        profile_created: profileCreated,
        verification_email_sent: verificationEmailSent,
        organization_member_created: organizationMemberCreated,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Registration error:', err)

    return {
      success: false,
      error: err.message || 'An unexpected error occurred during registration',
    }
  }
}

