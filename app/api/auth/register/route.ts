import { NextRequest, NextResponse } from 'next/server'
import { registerUser, RegisterInput } from '@/lib/auth/register'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

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

    // Validate role is one of the allowed values
    const validRoles = ['admin', 'manager', 'caretaker', 'tenant']
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
    }

    // Call registration function
    const result = await registerUser(registerInput)

    // Return appropriate status code based on result
    if (result.success) {
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

      return NextResponse.json(result, { status: statusCode })
    }
  } catch (error) {
    const err = error as Error

    // Handle JSON parse errors
    if (err.name === 'SyntaxError' || err.message.includes('JSON')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    // Handle other errors
    console.error('Registration API error:', err)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    )
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

