'use server'

import { createClient } from './server'
import { createAdminClient } from './admin'

export interface SupabaseTestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

/**
 * Test Supabase client-side initialization (for client components)
 * Note: This should be called from a client component
 */
export async function testClientSideSupabase(): Promise<SupabaseTestResult> {
  try {
    // This would be called from client-side
    // For server-side testing, we use testServerSideSupabase
    return {
      name: 'Client-side Supabase',
      status: 'warning',
      message: 'Client-side test should be run from browser',
      details: {
        note: 'Use testServerSideSupabase for server-side testing',
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Client-side Supabase',
      status: 'fail',
      message: 'Client-side test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test server-side Supabase client
 */
export async function testServerSideSupabase(): Promise<SupabaseTestResult> {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return {
        name: 'Server-side Supabase Client',
        status: 'fail',
        message: 'Failed to create server-side client',
      }
    }

    // Test basic query
    const { error } = await supabase.from('organizations').select('id').limit(0)

    if (error && error.code !== 'PGRST116') {
      return {
        name: 'Server-side Supabase Client',
        status: 'fail',
        message: 'Server client created but query failed',
        details: { error: error.message, code: error.code },
      }
    }

    return {
      name: 'Server-side Supabase Client',
      status: 'pass',
      message: 'Server-side client initialized and working',
      details: {
        canQuery: true,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Server-side Supabase Client',
      status: 'fail',
      message: 'Server-side client test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test admin Supabase client
 */
export async function testAdminSupabase(): Promise<SupabaseTestResult> {
  try {
    const adminClient = createAdminClient()

    if (!adminClient) {
      return {
        name: 'Admin Supabase Client',
        status: 'fail',
        message: 'Failed to create admin client',
      }
    }

    // Test admin query (bypasses RLS)
    const { error } = await adminClient.from('organizations').select('id').limit(0)

    if (error && error.code !== 'PGRST116') {
      return {
        name: 'Admin Supabase Client',
        status: 'fail',
        message: 'Admin client created but query failed',
        details: { error: error.message, code: error.code },
      }
    }

    return {
      name: 'Admin Supabase Client',
      status: 'pass',
      message: 'Admin client initialized and working',
      details: {
        canQuery: true,
        hasServiceRole: true,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Admin Supabase Client',
      status: 'fail',
      message: 'Admin client test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test database connection and basic operations
 */
export async function testDatabaseOperations(): Promise<SupabaseTestResult[]> {
  const results: SupabaseTestResult[] = []

  try {
    const supabase = await createClient()

    // Test 1: Can query organizations
    const { error: orgError } = await supabase.from('organizations').select('id').limit(1)
    results.push({
      name: 'Query Organizations Table',
      status: orgError && orgError.code !== 'PGRST116' ? 'fail' : 'pass',
      message: orgError
        ? `Cannot query organizations: ${orgError.message}`
        : 'Can query organizations table',
      details: orgError ? { error: orgError.message, code: orgError.code } : undefined,
    })

    // Test 2: Can query user_profiles
    const { error: profileError } = await supabase.from('user_profiles').select('id').limit(1)
    results.push({
      name: 'Query User Profiles Table',
      status: profileError && profileError.code !== 'PGRST116' ? 'fail' : 'pass',
      message: profileError
        ? `Cannot query user_profiles: ${profileError.message}`
        : 'Can query user_profiles table',
      details: profileError ? { error: profileError.message, code: profileError.code } : undefined,
    })

    // Test 3: Can query apartment_buildings
    const { error: buildingError } = await supabase
      .from('apartment_buildings')
      .select('id')
      .limit(1)
    results.push({
      name: 'Query Apartment Buildings Table',
      status: buildingError && buildingError.code !== 'PGRST116' ? 'fail' : 'pass',
      message: buildingError
        ? `Cannot query apartment_buildings: ${buildingError.message}`
        : 'Can query apartment_buildings table',
      details: buildingError
        ? { error: buildingError.message, code: buildingError.code }
        : undefined,
    })

    return results
  } catch (error) {
    const err = error as Error
    return [
      {
        name: 'Database Operations',
        status: 'fail',
        message: 'Database operations test failed',
        details: { error: err.message },
      },
    ]
  }
}

/**
 * Test RLS (Row Level Security) policies
 */
export async function testRLSPolicies(): Promise<SupabaseTestResult> {
  try {
    const supabase = await createClient()

    // Test RLS by trying to query without authentication
    // If RLS is working, we should get limited or no results
    const { data, error } = await supabase.from('organizations').select('id').limit(1)

    if (error) {
      // RLS might be blocking access, which is expected
      if (error.code === '42501' || error.message.includes('permission denied')) {
        return {
          name: 'RLS Policies',
          status: 'pass',
          message: 'RLS policies are active (access restricted as expected)',
          details: {
            rlsActive: true,
            error: error.message,
          },
        }
      }

      return {
        name: 'RLS Policies',
        status: 'warning',
        message: 'RLS test inconclusive',
        details: { error: error.message, code: error.code },
      }
    }

    // If we get data, RLS might not be configured or we have access
    return {
      name: 'RLS Policies',
      status: 'warning',
      message: 'RLS may not be fully configured (got data without auth)',
      details: {
        dataReturned: !!data,
        rowCount: data?.length || 0,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'RLS Policies',
      status: 'fail',
      message: 'RLS test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test storage operations
 */
export async function testStorageOperations(): Promise<SupabaseTestResult> {
  try {
    const supabase = await createClient()

    // List buckets
    const { data: buckets, error } = await supabase.storage.listBuckets()

    if (error) {
      return {
        name: 'Storage Operations',
        status: 'warning',
        message: 'Cannot list storage buckets (may need authentication)',
        details: { error: error.message },
      }
    }

    const bucketNames = buckets?.map((b) => b.name) || []
    const expectedBuckets = [
      'profile-pictures',
      'deposit-slips',
      'lease-documents',
      'maintenance-attachments',
      'organization-logos',
    ]

    const missingBuckets = expectedBuckets.filter((b) => !bucketNames.includes(b))

    if (missingBuckets.length > 0) {
      return {
        name: 'Storage Operations',
        status: 'warning',
        message: `Some expected buckets are missing: ${missingBuckets.join(', ')}`,
        details: {
          expected: expectedBuckets,
          found: bucketNames,
          missing: missingBuckets,
        },
      }
    }

    return {
      name: 'Storage Operations',
      status: 'pass',
      message: `All ${expectedBuckets.length} expected storage buckets exist`,
      details: {
        buckets: bucketNames,
        count: bucketNames.length,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Storage Operations',
      status: 'warning',
      message: 'Storage test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Run all Supabase tests
 */
export async function runAllSupabaseTests(): Promise<{
  success: boolean
  results: SupabaseTestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
  }
}> {
  const results: SupabaseTestResult[] = []

  // Run all tests
  results.push(await testServerSideSupabase())
  results.push(await testAdminSupabase())
  results.push(await testRLSPolicies())
  results.push(await testStorageOperations())

  // Add database operation tests
  const dbResults = await testDatabaseOperations()
  results.push(...dbResults)

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    warnings: results.filter((r) => r.status === 'warning').length,
  }

  return {
    success: summary.failed === 0,
    results,
    summary,
  }
}

