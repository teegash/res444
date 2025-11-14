'use server'

import { createClient } from '@/lib/supabase/server'
import { parseUnitNumberPattern } from './unitNumberGenerator'
import { hasPermission } from '@/lib/rbac/permissions'

export interface UnitGroup {
  count: number
  unit_number_pattern: string
  price_per_unit: number
  bedrooms: number
  bathrooms: number
  floor: number
  size_sqft: number
}

export interface BulkCreateRequest {
  units: UnitGroup[]
}

export interface CreatedUnit {
  id: string
  unit_number: string
  price: number
  status: string
}

export interface BulkCreateResult {
  success: boolean
  message?: string
  error?: string
  data?: {
    building_id: string
    bulk_group_id: string
    total_units_created: number
    units_by_price: Array<{ price: number; count: number }>
    total_revenue_potential: number
    units: CreatedUnit[]
  }
  validationErrors?: Array<{
    group: number
    field?: string
    error: string
  }>
}

/**
 * Validate unit group
 */
function validateUnitGroup(
  group: UnitGroup,
  index: number
): Array<{ group: number; field?: string; error: string }> {
  const errors: Array<{ group: number; field?: string; error: string }> = []

  // Validate count
  if (!group.count || group.count < 1 || group.count > 100) {
    errors.push({
      group: index,
      field: 'count',
      error: 'Count must be between 1 and 100',
    })
  }

  // Validate price
  if (!group.price_per_unit || group.price_per_unit < 1000 || group.price_per_unit > 500000) {
    errors.push({
      group: index,
      field: 'price_per_unit',
      error: 'Price must be between 1,000 and 500,000 KES',
    })
  }

  // Validate bedrooms
  if (!group.bedrooms || group.bedrooms < 1 || group.bedrooms > 5) {
    errors.push({
      group: index,
      field: 'bedrooms',
      error: 'Bedrooms must be between 1 and 5',
    })
  }

  // Validate bathrooms
  if (!group.bathrooms || group.bathrooms < 1 || group.bathrooms > 3) {
    errors.push({
      group: index,
      field: 'bathrooms',
      error: 'Bathrooms must be between 1 and 3',
    })
  }

  // Validate floor
  if (group.floor === undefined || group.floor < 0 || group.floor > 10) {
    errors.push({
      group: index,
      field: 'floor',
      error: 'Floor must be between 0 and 10',
    })
  }

  // Validate size
  if (!group.size_sqft || group.size_sqft < 100 || group.size_sqft > 5000) {
    errors.push({
      group: index,
      field: 'size_sqft',
      error: 'Size must be between 100 and 5,000 sqft',
    })
  }

  // Validate pattern
  if (!group.unit_number_pattern || group.unit_number_pattern.trim().length === 0) {
    errors.push({
      group: index,
      field: 'unit_number_pattern',
      error: 'Unit number pattern is required',
    })
  }

  return errors
}

/**
 * Check for duplicate unit numbers within the request
 */
function checkDuplicateUnitNumbers(
  allUnitNumbers: string[]
): { hasDuplicates: boolean; duplicates: string[] } {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const unitNumber of allUnitNumbers) {
    if (seen.has(unitNumber)) {
      duplicates.push(unitNumber)
    } else {
      seen.add(unitNumber)
    }
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
  }
}

/**
 * Check for existing unit numbers in database
 */
async function checkExistingUnitNumbers(
  buildingId: string,
  unitNumbers: string[]
): Promise<{ hasExisting: boolean; existing: string[] }> {
  const supabase = await createClient()
  
  const { data: existingUnits, error } = await supabase
    .from('apartment_units')
    .select('unit_number')
    .eq('building_id', buildingId)
    .in('unit_number', unitNumbers)

  if (error) {
    console.error('Error checking existing units:', error)
    // Don't fail on error, just log it
    return { hasExisting: false, existing: [] }
  }

  const existing = (existingUnits || []).map((unit) => unit.unit_number)

  return {
    hasExisting: existing.length > 0,
    existing,
  }
}

/**
 * Create bulk units with transaction
 */
export async function createBulkUnits(
  buildingId: string,
  userId: string,
  request: BulkCreateRequest
): Promise<BulkCreateResult> {
  try {
    const supabase = await createClient()

    // 1. Validate user has permission
    const canCreate = await hasPermission(userId, 'unit:create')
    if (!canCreate) {
      return {
        success: false,
        error: 'You do not have permission to create units',
      }
    }

    // 2. Validate building exists and user has access
    const { data: building, error: buildingError } = await supabase
      .from('apartment_buildings')
      .select('id, name, organization_id')
      .eq('id', buildingId)
      .single()

    if (buildingError || !building) {
      return {
        success: false,
        error: 'Building not found or you do not have access to it',
      }
    }

    // 3. Validate all unit groups
    const validationErrors: Array<{
      group: number
      field?: string
      error: string
    }> = []

    request.units.forEach((group, index) => {
      const errors = validateUnitGroup(group, index)
      validationErrors.push(...errors)
    })

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Validation failed',
        validationErrors,
      }
    }

    // 4. Parse all unit number patterns
    const parsedPatterns = request.units.map((group, index) => {
      const parsed = parseUnitNumberPattern(
        group.unit_number_pattern,
        group.count
      )

      if (!parsed.isValid) {
        validationErrors.push({
          group: index,
          field: 'unit_number_pattern',
          error: parsed.error || 'Invalid pattern',
        })
      }

      return parsed
    })

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Unit number pattern validation failed',
        validationErrors,
      }
    }

    // 5. Collect all unit numbers and check for duplicates
    const allUnitNumbers: string[] = []
    parsedPatterns.forEach((parsed) => {
      allUnitNumbers.push(...parsed.unitNumbers)
    })

    const duplicateCheck = checkDuplicateUnitNumbers(allUnitNumbers)
    if (duplicateCheck.hasDuplicates) {
      return {
        success: false,
        error: `Duplicate unit numbers found: ${duplicateCheck.duplicates.join(', ')}`,
        validationErrors: [
          {
            group: 0,
            error: `Duplicate unit numbers: ${duplicateCheck.duplicates.join(', ')}`,
          },
        ],
      }
    }

    // 6. Check for existing unit numbers in database
    const existingCheck = await checkExistingUnitNumbers(
      buildingId,
      allUnitNumbers
    )

    if (existingCheck.hasExisting) {
      return {
        success: false,
        error: `Some unit numbers already exist: ${existingCheck.existing.join(', ')}`,
        validationErrors: [
          {
            group: 0,
            error: `Existing unit numbers: ${existingCheck.existing.join(', ')}`,
          },
        ],
      }
    }

    // 7. Generate bulk group ID
    const bulkGroupId = crypto.randomUUID()

    // 8. Prepare units for insertion
    const unitsToInsert: Array<{
      building_id: string
      unit_number: string
      floor: number
      number_of_bedrooms: number
      number_of_bathrooms: number
      size_sqft: number
      status: string
      bulk_group_id: string
      unit_price_category: string
    }> = []

    request.units.forEach((group, groupIndex) => {
      const parsed = parsedPatterns[groupIndex]
      const priceCategory = `KES ${group.price_per_unit.toLocaleString()}`

      parsed.unitNumbers.forEach((unitNumber) => {
        unitsToInsert.push({
          building_id: buildingId,
          unit_number: unitNumber,
          floor: group.floor,
          number_of_bedrooms: group.bedrooms,
          number_of_bathrooms: group.bathrooms,
          size_sqft: group.size_sqft,
          status: 'vacant',
          bulk_group_id: bulkGroupId,
          unit_price_category: priceCategory,
        })
      })
    })

    // 9. Insert all units (Supabase handles transactions automatically for batch inserts)
    const { data: insertedUnits, error: insertError } = await supabase
      .from('apartment_units')
      .insert(unitsToInsert)
      .select('id, unit_number')

    if (insertError) {
      console.error('Error inserting units:', insertError)
      return {
        success: false,
        error: `Failed to create units: ${insertError.message}`,
      }
    }

    // 10. Create audit log
    const unitsData = {
      groups: request.units.map((group, index) => ({
        count: group.count,
        pattern: group.unit_number_pattern,
        price: group.price_per_unit,
        bedrooms: group.bedrooms,
        bathrooms: group.bathrooms,
        floor: group.floor,
        size_sqft: group.size_sqft,
        unit_numbers: parsedPatterns[index].unitNumbers,
      })),
      total_units: allUnitNumbers.length,
    }

    const { error: logError } = await supabase
      .from('bulk_unit_creation_logs')
      .insert({
        building_id: buildingId,
        bulk_group_id: bulkGroupId,
        created_by: userId,
        units_created: allUnitNumbers.length,
        units_data: unitsData,
      })

    if (logError) {
      console.error('Error creating audit log:', logError)
      // Don't fail the operation if logging fails
    }

    // 11. Calculate summary
    const unitsByPrice = request.units.reduce(
      (acc, group) => {
        const existing = acc.find((item) => item.price === group.price_per_unit)
        if (existing) {
          existing.count += group.count
        } else {
          acc.push({ price: group.price_per_unit, count: group.count })
        }
        return acc
      },
      [] as Array<{ price: number; count: number }>
    )

    const totalRevenuePotential = request.units.reduce(
      (sum, group) => sum + group.price_per_unit * group.count,
      0
    )

    // 12. Format response
    const createdUnits: CreatedUnit[] = (insertedUnits || []).map((unit) => {
      // Find the price for this unit
      const groupIndex = parsedPatterns.findIndex((parsed) =>
        parsed.unitNumbers.includes(unit.unit_number)
      )
      const price =
        groupIndex >= 0 ? request.units[groupIndex].price_per_unit : 0

      return {
        id: unit.id,
        unit_number: unit.unit_number,
        price,
        status: 'vacant',
      }
    })

    return {
      success: true,
      message: `${allUnitNumbers.length} units created successfully`,
      data: {
        building_id: buildingId,
        bulk_group_id: bulkGroupId,
        total_units_created: allUnitNumbers.length,
        units_by_price: unitsByPrice,
        total_revenue_potential: totalRevenuePotential,
        units: createdUnits,
      },
    }
  } catch (error) {
    const err = error as Error
    console.error('Error in createBulkUnits:', err)
    return {
      success: false,
      error: err.message || 'An unexpected error occurred',
    }
  }
}

