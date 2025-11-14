/**
 * Example usage of the registration API
 * 
 * This file demonstrates how to use the registration endpoint
 * from both client-side and server-side code.
 */

// Example 1: Using the API endpoint from client-side
export async function registerUserFromClient() {
  // Without organization (user can join/create later)
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'john@example.com',
      password: 'SecurePass123',
      full_name: 'John Doe',
      phone: '+254712345678',
      role: 'manager',
      // organization_id is optional
    }),
  })

  // With organization (if you have an organization_id)
  const responseWithOrg = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'jane@example.com',
      password: 'SecurePass123',
      full_name: 'Jane Smith',
      phone: '+254723456789',
      role: 'tenant',
      organization_id: 'your-organization-uuid-here', // Optional
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('User registered:', result.data)
    // Handle success
  } else {
    console.error('Registration failed:', result.error)
    // Handle error
  }
}

// Example 2: Using the registerUser function directly from server-side
import { registerUser } from './register'

export async function registerUserFromServer() {
  // Without organization
  const result = await registerUser({
    email: 'jane@example.com',
    password: 'SecurePass123',
    full_name: 'Jane Smith',
    phone: '+254723456789',
    role: 'tenant',
    // organization_id is optional
  })

  // With organization
  const resultWithOrg = await registerUser({
    email: 'bob@example.com',
    password: 'SecurePass123',
    full_name: 'Bob Wilson',
    phone: '+254734567890',
    role: 'caretaker',
    organization_id: 'your-organization-uuid-here', // Optional
  })

  if (result.success) {
    console.log('User registered:', result.data)
    return result
  } else {
    console.error('Registration failed:', result.error)
    throw new Error(result.error)
  }
}

// Example 3: Error handling examples
export const errorExamples = {
  // Email already exists
  duplicateEmail: {
    error: 'Email already exists. Please use a different email address.',
  },

  // Invalid phone format
  invalidPhone: {
    error: 'Invalid phone format. Use Kenya format: +254XXXXXXXXX (e.g., +254712345678)',
  },

  // Weak password
  weakPassword: {
    error: 'Password must contain at least one uppercase letter',
    // or
    // error: 'Password must be at least 8 characters long',
    // or
    // error: 'Password must contain at least one number',
  },

  // Missing fields
  missingFields: {
    error: 'Missing required fields. Please provide: email, password, full_name, phone, and role',
  },

  // Invalid role
  invalidRole: {
    error: 'Invalid role. Must be one of: admin, manager, caretaker, tenant',
  },
}

// Example 4: Success response
export const successResponse = {
  success: true,
  message: 'User created successfully',
  data: {
    user_id: 'uuid-here',
    email: 'john@example.com',
    profile_created: true,
    verification_email_sent: true,
    organization_member_created: true,
  },
}

