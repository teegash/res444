/**
 * Example usage of bulk unit creation endpoint
 * 
 * This file demonstrates how to use the bulk unit creation API
 */

// Example 1: Create 10 units @ KES 10,000 + 20 units @ KES 25,000
export async function createBulkUnitsExample() {
  const buildingId = 'your-building-uuid-here'
  
  const response = await fetch(`/api/properties/${buildingId}/units/bulk-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      units: [
        {
          count: 10,
          unit_number_pattern: '101-110',
          price_per_unit: 10000,
          bedrooms: 2,
          bathrooms: 1,
          floor: 1,
          size_sqft: 900,
        },
        {
          count: 20,
          unit_number_pattern: '201-220',
          price_per_unit: 25000,
          bedrooms: 3,
          bathrooms: 2,
          floor: 2,
          size_sqft: 1400,
        },
      ],
    }),
  })

  const result = await response.json()

  if (result.success) {
    console.log('Units created:', result.data)
    // {
    //   building_id: "uuid",
    //   bulk_group_id: "uuid",
    //   total_units_created: 30,
    //   units_by_price: [
    //     { price: 10000, count: 10 },
    //     { price: 25000, count: 20 }
    //   ],
    //   total_revenue_potential: 700000,
    //   units: [...]
    // }
  } else {
    console.error('Error:', result.error)
    if (result.validationErrors) {
      console.error('Validation errors:', result.validationErrors)
    }
  }
}

// Example 2: Alphanumeric unit numbers
export async function createAlphanumericUnitsExample() {
  const buildingId = 'your-building-uuid-here'
  
  const response = await fetch(`/api/properties/${buildingId}/units/bulk-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      units: [
        {
          count: 10,
          unit_number_pattern: '1-A to 1-J', // Generates: 1-A, 1-B, ..., 1-J
          price_per_unit: 15000,
          bedrooms: 2,
          bathrooms: 1,
          floor: 1,
          size_sqft: 950,
        },
      ],
    }),
  })

  const result = await response.json()
  return result
}

// Example 3: Error handling
export async function createUnitsWithErrorHandling() {
  const buildingId = 'your-building-uuid-here'
  
  try {
    const response = await fetch(`/api/properties/${buildingId}/units/bulk-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        units: [
          {
            count: 5,
            unit_number_pattern: '101-105',
            price_per_unit: 10000,
            bedrooms: 2,
            bathrooms: 1,
            floor: 1,
            size_sqft: 900,
          },
        ],
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
        console.error('Building not found')
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

// Example 4: Using from server action
export async function createBulkUnitsServerAction(
  buildingId: string,
  units: Array<{
    count: number
    unit_number_pattern: string
    price_per_unit: number
    bedrooms: number
    bathrooms: number
    floor: number
    size_sqft: number
  }>
) {
  'use server'
  
  const { createBulkUnits } = await import('./bulkUnitCreation')
  const { requireAuth } = await import('@/lib/rbac/routeGuards')
  
  const { userId } = await requireAuth()
  
  const result = await createBulkUnits(buildingId, userId, { units })
  
  return result
}

