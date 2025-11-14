/**
 * Example usage of tenant creation with auto-populated lease
 * 
 * This file demonstrates how to use the tenant creation endpoint
 */

// Example 1: Create tenant with lease from client-side
export async function createTenantWithLeaseExample() {
  const response = await fetch('/api/tenants/create-with-lease', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      unit_id: 'your-unit-uuid-here',
      tenant: {
        full_name: 'John Doe',
        email: 'john@example.com',
        phone_number: '+254712345678',
        national_id: '12345678',
        date_of_birth: '1990-01-15',
        address: '123 Main St, Nairobi',
      },
      lease: {
        start_date: '2024-02-01',
      },
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('Tenant created:', result.data)
    // {
    //   tenant: { id, full_name, email, phone_number },
    //   lease: {
    //     id, unit_id, unit_number, building_name,
    //     monthly_rent, deposit_amount, start_date, end_date,
    //     lease_duration_months, rent_locked, rent_locked_reason,
    //     lease_auto_generated
    //   },
    //   invoice_created: true,
    //   invitation_sent: true
    // }
  } else {
    console.error('Error:', result.error)
    if (result.validationErrors) {
      console.error('Validation errors:', result.validationErrors)
    }
  }
}

// Example 2: Error handling
export async function createTenantWithErrorHandling() {
  try {
    const response = await fetch('/api/tenants/create-with-lease', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        unit_id: 'unit-uuid',
        tenant: {
          full_name: 'Jane Smith',
          email: 'jane@example.com',
          phone_number: '+254723456789',
          national_id: '87654321',
        },
        lease: {
          start_date: '2024-02-01',
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      
      // Handle different error types
      if (response.status === 401) {
        console.error('Unauthorized - please sign in')
      } else if (response.status === 403) {
        console.error('Forbidden - insufficient permissions')
      } else if (response.status === 404) {
        console.error('Unit not found')
      } else if (response.status === 409) {
        console.error('Conflict:', error.error)
        // Unit occupied, email exists, national ID exists, etc.
      } else if (response.status === 400) {
        console.error('Validation error:', error.validationErrors)
      } else {
        console.error('Server error:', error.error)
      }
      
      return
    }

    const result = await response.json()
    if (result.success) {
      console.log('Success!', result.data)
    }
  } catch (error) {
    console.error('Network error:', error)
  }
}

// Example 3: Using from server action
export async function createTenantServerAction(
  unitId: string,
  tenant: {
    full_name: string
    email: string
    phone_number: string
    national_id: string
    date_of_birth?: string
    address?: string
  },
  startDate: string
) {
  'use server'
  
  const { createTenantWithLease } = await import('./leaseCreation')
  const { requireAuth } = await import('@/lib/rbac/routeGuards')
  
  const { userId } = await requireAuth()
  
  const result = await createTenantWithLease(
    {
      unit_id: unitId,
      tenant,
      lease: { start_date: startDate },
    },
    userId
  )
  
  return result
}

// Example 4: Success response structure
export const successResponseExample = {
  success: true,
  message: 'Tenant and lease created successfully',
  data: {
    tenant: {
      id: 'uuid',
      full_name: 'John Doe',
      email: 'john@example.com',
      phone_number: '+254712345678',
    },
    lease: {
      id: 'uuid',
      unit_id: 'uuid',
      unit_number: '101',
      building_name: 'Alpha Complex',
      monthly_rent: 10000,
      deposit_amount: 10000,
      start_date: '2024-02-01',
      end_date: '2025-02-01',
      lease_duration_months: 12,
      rent_locked: true,
      rent_locked_reason: 'Auto-populated from unit specifications',
      lease_auto_generated: true,
    },
    invoice_created: true,
    invitation_sent: true,
  },
}

// Example 5: Error response examples
export const errorExamples = {
  unitOccupied: {
    success: false,
    error: 'Unit is currently occupied. Please select a vacant unit.',
  },
  emailExists: {
    success: false,
    error: 'Email already registered. Please use a different email address.',
  },
  invalidPhone: {
    success: false,
    error: 'Phone number must be Kenya format: +254XXXXXXXXX (e.g., +254712345678)',
  },
  nationalIdExists: {
    success: false,
    error: 'National ID already exists. Please contact support if this is an error.',
  },
  unitNotFound: {
    success: false,
    error: 'Unit not found',
  },
  invalidDate: {
    success: false,
    error: 'Start date must be today or later',
  },
  noPrice: {
    success: false,
    error: 'Unit price not found. Please set a price for this unit (unit_price_category) before creating a lease. Expected format: "KES 10,000" or "10000".',
  },
}

