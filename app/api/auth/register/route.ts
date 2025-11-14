import { NextRequest, NextResponse } from 'next/server'
import { registerUser, RegisterInput } from '@/lib/auth/register'

export async function POST(request: NextRequest) {
  console.log('Registration API called at:', new Date().toISOString())
  
  try {
    console.log('Parsing request body...')
    const body = await request.json()
    console.log('Request body parsed. Email:', body.email, 'Role:', body.role)

    // Validate required fields
    const { 
      email, 
      password, 
      full_name, 
      phone, 
      role, 
      organization_id, 
      building_id,
      national_id,
      address,
      date_of_birth
    } = body

    if (!email || !password || !full_name || !phone || !role) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields. Please provide: email, password, full_name, phone, and role',
        },
        { status: 400 }
      )
    }

    // Require organization_id for managers and caretakers
    if ((role === 'manager' || role === 'caretaker') && !organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Organization is required for managers and caretakers',
        },
        { status: 400 }
      )
    }

    // Require building_id for caretakers
    if (role === 'caretaker' && !building_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Apartment building is required for caretakers',
        },
        { status: 400 }
      )
    }

    // Validate role is one of the allowed values (removed tenant)
    const validRoles = ['admin', 'manager', 'caretaker']
    const normalizedRole = role.trim().toLowerCase()
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid role. Role must be one of: ${validRoles.join(', ')}. Received: ${role}`,
        },
        { status: 400 }
      )
    }

    // Organization data is NOT required during registration
    // Owners will set up their organization after email confirmation and first login
    // This prevents Vercel API timeout issues

    // Log the role being registered for debugging
    console.log('Registration API - Registering user with role:', normalizedRole)

    // Prepare registration input
    const registerInput: RegisterInput = {
      email: email.trim(),
      password,
      full_name: full_name.trim(),
      phone: phone.trim(),
      role: normalizedRole as RegisterInput['role'],
      organization_id: organization_id?.trim(),
      building_id: building_id?.trim(), // For caretakers
      national_id: national_id?.trim(), // Optional - national ID
      address: address?.trim(), // Optional - address
      date_of_birth: date_of_birth?.trim(), // Optional - date of birth (YYYY-MM-DD)
      // organization is NOT included - owners set it up after first login
    }

    // Call registration function with timeout wrapper
    console.log('Calling registerUser with input:', {
      email: registerInput.email,
      role: registerInput.role,
      hasOrganization: !!registerInput.organization,
    })
    
    // Wrap registerUser in a timeout to ensure we always return a response
    // Reduced timeout to 20 seconds - registration should be fast now
    const registrationPromise = registerUser(registerInput)
    const registrationTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Registration process timed out after 20 seconds')), 20000) // Reduced from 90s to 20s
    )
    
    let result: any
    try {
      result = await Promise.race([
        registrationPromise,
        registrationTimeoutPromise
      ]) as any
      
      console.log('registerUser result:', {
        success: result.success,
        error: result.error,
        data: result.data,
      })
    } catch (timeoutError: any) {
      console.error('Registration timed out at API level:', timeoutError.message)
      return NextResponse.json(
        {
          success: false,
          error: 'Registration timed out. Please try again. If the issue persists, the account may have been created - try logging in.',
        },
        { status: 504 } // Gateway Timeout
      )
    }

    // Return appropriate status code based on result
    if (result.success) {
      console.log('Registration successful, returning 201')
      return NextResponse.json(result, { status: 201 })
    } else {
      // Determine status code based on error type
      let statusCode = 400

      if (result.error?.includes('already exists') || result.error?.includes('already registered')) {
        statusCode = 409 // Conflict
      } else if (result.error?.includes('Invalid') || result.error?.includes('must')) {
        statusCode = 400 // Bad Request
      } else {
        statusCode = 500 // Internal Server Error
      }

      console.error('Registration failed:', result.error, 'Status:', statusCode)
      return NextResponse.json(result, { status: statusCode })
    }
  } catch (error) {
    const err = error as Error
    console.error('Registration API error caught:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    })

    // Handle JSON parse errors
    if (err.name === 'SyntaxError' || err.message.includes('JSON')) {
      console.error('JSON parse error')
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    // Handle other errors
    console.error('Registration API unexpected error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
  } finally {
    console.log('Registration API request completed at:', new Date().toISOString())
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to register a new user.',
    },
    { status: 405 }
  )
}

