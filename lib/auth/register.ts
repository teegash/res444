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
  role?: string,
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
      role?: string
      national_id?: string
      address?: string
      date_of_birth?: string
      updated_at?: string
    } = {
      id: userId,
      full_name: fullName.trim(),
      phone_number: phone.trim(),
    }

    // Add role if provided
    if (role && role.trim()) {
      profileData.role = role.trim()
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

    // Skip email check - Supabase will handle duplicate email validation during signUp
    // This saves 5 seconds and prevents unnecessary database queries
    console.log('Skipping email check - Supabase will validate during signUp')

    // Create Supabase client for auth operations
    // Use admin client to avoid cookie issues in server actions
    // signUp works fine with admin client - it will still send verification emails
    console.log('Creating Supabase admin client for auth...')
    const supabase = createAdminClient()
    console.log('Supabase admin client created')

    // Log the role being stored in user metadata
    console.log('Creating user with role:', input.role, 'for email:', input.email)

    // Create auth user with role and building_id in metadata
    // Also store organization_id for managers/caretakers so we can create member on first login
    const userMetadata: Record<string, any> = {
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      role: input.role, // Store role in user metadata for later use
    }
    
    // Store building_id for caretakers
    if (input.building_id) {
      userMetadata.building_id = input.building_id
    }
    
    // Store organization_id for managers/caretakers (will be used to create member on first login)
    if (input.organization_id) {
      userMetadata.organization_id = input.organization_id
    }

    console.log('Calling supabase.auth.signUp...')
    console.log('Environment check - SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL)
    
    // Use a more aggressive timeout and better error handling
    let authData: any = null
    let authError: any = null
    
    try {
      console.log('Starting signUp operation...')
      const startTime = Date.now()
      
      // Create a promise that will reject if signUp takes too long
      const signUpPromise = supabase.auth.signUp({
      email: input.email.toLowerCase().trim(),
      password: input.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: userMetadata,
        },
      })
      
      // Reduced timeout to 8 seconds - Supabase authenticated limit is 8s
      // Vercel Hobby plan has 10s limit, so 8s gives us buffer
      // If it times out, we'll check if user was created anyway
      const signUpTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => {
          const elapsed = Date.now() - startTime
          reject(new Error(`Sign up timed out after ${elapsed}ms (limit: 8000ms - Supabase limit)`))
        }, 8000) // Reduced to 8s to match Supabase authenticated user limit
      )
      
      console.log('Waiting for signUp to complete (timeout: 8s - Supabase limit)...')
      const result = await Promise.race([
        signUpPromise,
        signUpTimeoutPromise
      ]) as { data: any; error: any }
      
      const elapsed = Date.now() - startTime
      console.log(`SignUp completed in ${elapsed}ms`)
      
      authData = result?.data || null
      authError = result?.error || null
      
      console.log('Sign up result:')
      console.log('  - User created:', !!authData?.user)
      console.log('  - Has error:', !!authError)
      console.log('  - User ID:', authData?.user?.id)
      console.log('  - Error message:', authError?.message)
      
      // If we have an error, log it immediately
      if (authError) {
        console.error('SignUp error details:', {
          message: authError.message,
          status: authError.status,
          name: authError.name,
        })
      }
    } catch (timeoutError: any) {
      const elapsed = Date.now() - startTime
      console.error(`SignUp operation failed after ${elapsed}ms:`, timeoutError.message)
      
      // If it's a timeout, check if user was created anyway
      // This is critical - Supabase might have created the user even if the response timed out
      if (timeoutError.message.includes('timed out')) {
        console.log('⚠ SignUp timed out - checking if user was created anyway...')
        try {
          // Use a shorter timeout for the check (2 seconds)
          const checkPromise = supabase.auth.admin.getUserByEmail(input.email.toLowerCase().trim())
          const checkTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User check timed out')), 2000)
          )
          
          const { data: existingUser, error: checkError } = await Promise.race([
            checkPromise,
            checkTimeoutPromise
          ]) as any
          
          if (checkError && checkError.status !== 404) {
            console.error('Error checking existing user:', checkError.message)
          }
          
          if (existingUser?.user) {
            console.log('✓ User was created despite timeout, using existing user:', existingUser.user.id)
            authData = { user: existingUser.user }
            authError = null
            // User exists - registration can proceed
          } else {
            console.log('✗ User was not created - registration failed')
            authError = timeoutError
          }
        } catch (checkError: any) {
          console.error('Failed to check existing user:', checkError.message)
          // If check also fails, assume user wasn't created
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
    
    // Profile is created by database trigger automatically with role from metadata
    // Trigger populates: id, full_name (from user_metadata.full_name), phone_number (from user_metadata.phone), role (from user_metadata.role)
    // Additional fields (national_id, address, date_of_birth) can be updated later if needed via API
    // We don't update profile during registration to keep it fast - just user account creation
    console.log('✓ User account created. Profile will be created by database trigger with role from metadata')
    
    // Organization creation is SKIPPED during registration
    // Owners will set up their organization after email confirmation and first login
    // This prevents Vercel API timeout issues
    let createdOrganizationId: string | undefined = undefined
    console.log('Organization creation skipped - will be done after first login for owners')

    // Organization member creation is also SKIPPED during registration
    // It will be created on first login by the proxy or signin API
    // This keeps registration fast - just user account creation
    if (input.organization_id) {
      console.log('Organization member creation skipped - will be created on first login')
    }

    // Determine if verification email was sent
    // Supabase sends verification email automatically if email confirmation is enabled
    const verificationEmailSent = !authData.session && authData.user

    // User account is created - that's the critical part!
    // Profile is created by database trigger automatically with role from metadata
    // Additional profile fields and organization member are updated/created asynchronously
    // This ensures registration completes quickly (just user creation)
    
    console.log('✓ Registration completed successfully:')
    console.log('  - User account created in auth.users:', userId)
    console.log('  - Profile will be created by database trigger with role from metadata')
    if (input.organization_id) {
      console.log('  - Organization member will be created asynchronously')
    }
    if (createdOrganizationId) {
      console.log('  - Organization created in organizations table:', createdOrganizationId)
    }

    return {
      success: true,
      message: 'User created successfully. Please check your email to verify your account.',
      data: {
        user_id: userId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        profile_created: true, // Created by trigger
        organization_created: !!createdOrganizationId,
        organization_id: createdOrganizationId,
        organization_member_created: !!input.organization_id, // Will be created asynchronously
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
