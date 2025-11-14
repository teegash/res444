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
    console.log('Creating user profile for userId:', userId)
    // Use admin client to bypass RLS and avoid cookie issues
    const supabase = createAdminClient()

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
      // Validate date format (YYYY-MM-DD) - database expects DATE type
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (dateRegex.test(dateOfBirth.trim())) {
        profileData.date_of_birth = dateOfBirth.trim()
      } else {
        console.warn('Invalid date_of_birth format, skipping:', dateOfBirth)
      }
    }

    // First, check if profile already exists (might have been created by trigger)
    // Add timeout to prevent hanging
    console.log('Checking if profile exists...')
    const checkPromise = supabase
      .from('user_profiles')
      .select('id, full_name, phone_number')
      .eq('id', userId)
      .maybeSingle()
    
    const checkTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Profile check timed out after 5 seconds')), 5000)
    )
    
    const { data: existingProfile } = await Promise.race([
      checkPromise,
      checkTimeoutPromise
    ]) as any

    if (existingProfile) {
      // Profile exists (likely created by trigger), update it with our data
      console.log('Profile exists, updating...')
      const updateData = { ...profileData }
      delete updateData.id // Don't include id in update
      updateData.updated_at = new Date().toISOString()

      const updatePromise = supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
      
      const updateTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile update timed out after 10 seconds')), 10000)
      )
      
      const { error: updateError } = await Promise.race([
        updatePromise,
        updateTimeoutPromise
      ]) as any

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

      console.log('Profile updated successfully')
      return { success: true }
    }

    // Profile doesn't exist, create it
    console.log('Profile does not exist, creating new profile...')
    const insertPromise = supabase.from('user_profiles').insert(profileData)
    
    const insertTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Profile insert timed out after 10 seconds')), 10000)
    )
    
    const { error } = await Promise.race([
      insertPromise,
      insertTimeoutPromise
    ]) as any

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

    // Check email uniqueness with timeout
    console.log('Checking email uniqueness...')
    try {
      const emailCheckPromise = checkEmailExists(input.email)
      const emailTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email check timed out')), 5000)
      )
      
      const emailExists = await Promise.race([emailCheckPromise, emailTimeoutPromise]) as boolean
      
      if (emailExists) {
        return {
          success: false,
          error: 'Email already exists. Please use a different email address.',
        }
      }
    } catch (emailCheckError: any) {
      console.warn('Email check failed or timed out, continuing anyway:', emailCheckError.message)
      // Continue with registration - email uniqueness will be checked by Supabase
    }

    // Create Supabase client for auth operations
    // Use admin client to avoid cookie issues in server actions
    // signUp works fine with admin client - it will still send verification emails
    console.log('Creating Supabase admin client for auth...')
    const supabase = createAdminClient()
    console.log('Supabase admin client created')

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

    console.log('Calling supabase.auth.signUp...')
    
    // Use a more aggressive timeout and better error handling
    let authData: any = null
    let authError: any = null
    
    try {
      // Create a promise that will reject if signUp takes too long
      const signUpPromise = supabase.auth.signUp({
        email: input.email.toLowerCase().trim(),
        password: input.password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: userMetadata,
        },
      })
      
      // Use a shorter timeout - if signUp takes longer than 20 seconds, something is wrong
      const signUpTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Sign up timed out after 20 seconds')), 20000)
      )
      
      const result = await Promise.race([
        signUpPromise,
        signUpTimeoutPromise
      ])
      
      authData = result.data
      authError = result.error
      
      console.log('Sign up completed. User created:', !!authData?.user, 'Error:', !!authError)
    } catch (timeoutError: any) {
      console.error('SignUp operation timed out or failed:', timeoutError.message)
      // If it's a timeout, check if user was created anyway
      if (timeoutError.message.includes('timed out')) {
        // Try to verify if user was created by checking auth
        try {
          const { data: existingUser } = await supabase.auth.admin.getUserByEmail(input.email.toLowerCase().trim())
          if (existingUser?.user) {
            console.log('User was created despite timeout, using existing user')
            authData = { user: existingUser.user }
            authError = null
          } else {
            authError = timeoutError
          }
        } catch (checkError) {
          authError = timeoutError
        }
      } else {
        authError = timeoutError
      }
    }

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

    // Create user profile - MUST succeed for registration to complete
    console.log('Creating user profile (required)...')
    try {
      const profileResult = await Promise.race([
        createUserProfile(
          userId,
          input.full_name.trim(),
          input.phone.trim(),
          input.national_id,
          input.address,
          input.date_of_birth
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile creation timed out after 10 seconds')), 10000)
        )
      ]) as any
      
      if (profileResult?.success) {
        profileCreated = true
        console.log('✓ Profile created successfully in user_profiles table')
      } else {
        console.error('✗ Profile creation failed:', profileResult?.error)
        // Profile creation is critical - fail registration if it fails
        return {
          success: false,
          error: profileResult?.error || 'Failed to create user profile. Please try again.',
        }
      }
    } catch (profileError: any) {
      console.error('✗ Profile creation error:', profileError.message)
      return {
        success: false,
        error: `Profile creation failed: ${profileError.message}. Please try again.`,
      }
    }

    // Create organization if provided (for owners) - MUST succeed for owners
    let createdOrganizationId: string | undefined
    if (input.organization) {
      console.log('Creating organization (required for owners)...')
      try {
        const adminSupabase = createAdminClient()
        
        const insertResult = await Promise.race([
          adminSupabase
            .from('organizations')
            .insert({
              name: input.organization.name,
              email: input.organization.email.toLowerCase(),
              phone: input.organization.phone || null,
              location: input.organization.location,
              registration_number: input.organization.registration_number,
              logo_url: input.organization.logo_url || null,
            })
            .select()
            .single(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Organization insert timed out after 15 seconds')), 15000)
          )
        ]) as any
        
        if (insertResult.error) {
          if (insertResult.error.code === '23505') {
            return {
              success: false,
              error: 'Registration number already exists. Please use a different registration number.',
            }
          }
          console.error('✗ Organization creation error:', insertResult.error)
          return {
            success: false,
            error: insertResult.error.message || 'Failed to create organization. Please try again.',
          }
        }
        
        const organization = Array.isArray(insertResult.data)
          ? insertResult.data[0]
          : insertResult.data

        if (organization?.id) {
          createdOrganizationId = organization.id
          console.log('✓ Organization created successfully in organizations table:', organization.id)
        } else {
          console.error('✗ Organization created but ID missing')
          return {
            success: false,
            error: 'Organization was created but ID was not returned. Please verify Supabase insert permissions.',
          }
        }
      } catch (orgError: any) {
        console.error('✗ Organization creation error:', orgError.message)
        return {
          success: false,
          error: `Organization creation failed: ${orgError.message}. Please try again.`,
        }
      }
    }

    // Create organization member - MUST succeed if organization exists
    if (input.organization_id || createdOrganizationId) {
      console.log('Creating organization member (required)...')
      try {
        const memberResult = await Promise.race([
          createOrganizationMember(
            userId,
            input.role,
            input.organization_id || createdOrganizationId,
            true
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Organization member creation timed out after 10 seconds')), 10000)
          )
        ]) as any
        
        if (memberResult?.success) {
          organizationMemberCreated = true
          console.log('✓ Organization member created successfully')
        } else {
          console.error('✗ Organization member creation failed:', memberResult?.error)
          // Member creation is critical - fail registration if it fails
          return {
            success: false,
            error: memberResult?.error || 'Failed to link user to organization. Please try again.',
          }
        }
      } catch (memberError: any) {
        console.error('✗ Organization member creation error:', memberError.message)
        return {
          success: false,
          error: `Failed to create organization member: ${memberError.message}. Please try again.`,
        }
      }
    }

    // Determine if verification email was sent
    // Supabase sends verification email automatically if email confirmation is enabled
    const verificationEmailSent = !authData.session && authData.user

    // Verify that critical data was saved
    if (!profileCreated) {
      console.error('✗ Registration completed but profile was not created')
      return {
        success: false,
        error: 'User account created but profile was not saved. Please contact support.',
      }
    }

    if (input.organization && !createdOrganizationId) {
      console.error('✗ Registration completed but organization was not created')
      return {
        success: false,
        error: 'User account created but organization was not saved. Please contact support.',
      }
    }

    if ((input.organization_id || createdOrganizationId) && !organizationMemberCreated) {
      console.error('✗ Registration completed but organization member was not created')
      return {
        success: false,
        error: 'User account created but organization membership was not saved. Please contact support.',
      }
    }

    console.log('✓ Registration completed successfully with all data saved:')
    console.log('  - User account created in auth.users')
    console.log('  - Profile created in user_profiles table:', profileCreated)
    if (createdOrganizationId) {
      console.log('  - Organization created in organizations table:', createdOrganizationId)
    }
    if (organizationMemberCreated) {
      console.log('  - Organization member created in organization_members table')
    }

    return {
      success: true,
      message: 'User created successfully with all data saved',
      data: {
        user_id: userId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        profile_created: profileCreated,
        organization_created: !!createdOrganizationId,
        organization_id: createdOrganizationId,
        organization_member_created: organizationMemberCreated,
        verification_email_sent: verificationEmailSent,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Registration error in registerUser:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    })

    return {
      success: false,
      error: err.message || 'An unexpected error occurred during registration',
    }
  }
}
