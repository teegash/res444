import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

/**
 * Comprehensive Supabase Integration Test Endpoint
 * 
 * Tests:
 * 1. Environment variables
 * 2. Client initialization (server-side)
 * 3. Admin client initialization
 * 4. Database connection
 * 5. Authentication
 * 6. RLS policies
 * 7. Storage buckets
 * 8. Table access
 */
export async function GET(request: NextRequest) {
  const results: TestResult[] = []
  let overallStatus: 'pass' | 'fail' | 'warning' = 'pass'

  try {
    // Test 1: Environment Variables
    results.push(await testEnvironmentVariables())

    // Test 2: Server-side Client Initialization
    results.push(await testServerClient())

    // Test 3: Admin Client Initialization
    results.push(await testAdminClient())

    // Test 4: Database Connection
    results.push(await testDatabaseConnection())

    // Test 5: Authentication
    results.push(await testAuthentication())

    // Test 6: Table Access (with RLS)
    results.push(await testTableAccess())

    // Test 7: Storage Buckets
    results.push(await testStorageBuckets())

    // Test 8: Database Tables Existence
    results.push(await testDatabaseTables())

    // Determine overall status
    const failedTests = results.filter((r) => r.status === 'fail')
    const warningTests = results.filter((r) => r.status === 'warning')

    if (failedTests.length > 0) {
      overallStatus = 'fail'
    } else if (warningTests.length > 0) {
      overallStatus = 'warning'
    }

    return NextResponse.json(
      {
        success: overallStatus === 'pass',
        status: overallStatus,
        summary: {
          total: results.length,
          passed: results.filter((r) => r.status === 'pass').length,
          failed: failedTests.length,
          warnings: warningTests.length,
        },
        results,
        timestamp: new Date().toISOString(),
      },
      { status: overallStatus === 'fail' ? 500 : 200 }
    )
  } catch (error) {
    const err = error as Error
    return NextResponse.json(
      {
        success: false,
        status: 'fail',
        error: 'Test suite failed',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      { status: 500 }
    )
  }
}

/**
 * Test 1: Environment Variables
 */
async function testEnvironmentVariables(): Promise<TestResult> {
  const missing: string[] = []

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }

  if (missing.length > 0) {
    return {
      name: 'Environment Variables',
      status: 'fail',
      message: `Missing required environment variables: ${missing.join(', ')}`,
      details: { missing },
    }
  }

  // Validate URL format
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    return {
      name: 'Environment Variables',
      status: 'warning',
      message: 'Supabase URL format may be incorrect',
      details: { url },
    }
  }

  return {
    name: 'Environment Variables',
    status: 'pass',
    message: 'All required environment variables are set',
    details: {
      url: url.substring(0, 30) + '...',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  }
}

/**
 * Test 2: Server-side Client Initialization
 */
async function testServerClient(): Promise<TestResult> {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return {
        name: 'Server Client Initialization',
        status: 'fail',
        message: 'Failed to create server-side Supabase client',
      }
    }

    // Test basic connection
    const { data, error } = await supabase.from('organizations').select('count').limit(0)

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is fine for this test
      return {
        name: 'Server Client Initialization',
        status: 'fail',
        message: 'Server client created but database query failed',
        details: { error: error.message, code: error.code },
      }
    }

    return {
      name: 'Server Client Initialization',
      status: 'pass',
      message: 'Server-side Supabase client initialized successfully',
      details: {
        canQuery: true,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Server Client Initialization',
      status: 'fail',
      message: 'Failed to initialize server-side client',
      details: { error: err.message },
    }
  }
}

/**
 * Test 3: Admin Client Initialization
 */
async function testAdminClient(): Promise<TestResult> {
  try {
    const adminClient = createAdminClient()

    if (!adminClient) {
      return {
        name: 'Admin Client Initialization',
        status: 'fail',
        message: 'Failed to create admin Supabase client',
      }
    }

    // Test admin access (should bypass RLS)
    const { data, error } = await adminClient
      .from('organizations')
      .select('count')
      .limit(0)

    if (error && error.code !== 'PGRST116') {
      return {
        name: 'Admin Client Initialization',
        status: 'fail',
        message: 'Admin client created but database query failed',
        details: { error: error.message, code: error.code },
      }
    }

    return {
      name: 'Admin Client Initialization',
      status: 'pass',
      message: 'Admin Supabase client initialized successfully',
      details: {
        canQuery: true,
        hasServiceRole: true,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Admin Client Initialization',
      status: 'fail',
      message: 'Failed to initialize admin client',
      details: { error: err.message },
    }
  }
}

/**
 * Test 4: Database Connection
 */
async function testDatabaseConnection(): Promise<TestResult> {
  try {
    const supabase = await createClient()

    // Test connection with a simple query
    const { data, error } = await supabase.rpc('version')

    if (error) {
      // If version() doesn't work, try a simple select
      const { error: selectError } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)

      if (selectError) {
        return {
          name: 'Database Connection',
          status: 'fail',
          message: 'Cannot connect to Supabase database',
          details: { error: selectError.message, code: selectError.code },
        }
      }
    }

    return {
      name: 'Database Connection',
      status: 'pass',
      message: 'Database connection successful',
      details: {
        connected: true,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Database Connection',
      status: 'fail',
      message: 'Database connection failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test 5: Authentication
 */
async function testAuthentication(): Promise<TestResult> {
  try {
    const supabase = await createClient()

    // Test auth methods availability
    const authMethods = {
      signUp: typeof supabase.auth.signUp === 'function',
      signIn: typeof supabase.auth.signInWithPassword === 'function',
      signOut: typeof supabase.auth.signOut === 'function',
      getSession: typeof supabase.auth.getSession === 'function',
      getUser: typeof supabase.auth.getUser === 'function',
    }

    const allMethodsAvailable = Object.values(authMethods).every((v) => v === true)

    if (!allMethodsAvailable) {
      return {
        name: 'Authentication',
        status: 'fail',
        message: 'Some authentication methods are not available',
        details: { authMethods },
      }
    }

    // Test getting current session (may be null, which is fine)
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      return {
        name: 'Authentication',
        status: 'warning',
        message: 'Authentication methods available but session check failed',
        details: { error: error.message, authMethods },
      }
    }

    return {
      name: 'Authentication',
      status: 'pass',
      message: 'Authentication system is functional',
      details: {
        authMethods,
        hasSession: !!session,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Authentication',
      status: 'fail',
      message: 'Authentication test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test 6: Table Access (with RLS)
 */
async function testTableAccess(): Promise<TestResult> {
  try {
    const supabase = await createClient()

    // Test access to key tables
    const tables = [
      'organizations',
      'organization_members',
      'user_profiles',
      'apartment_buildings',
      'apartment_units',
      'leases',
      'invoices',
      'payments',
    ]

    const accessResults: Record<string, { accessible: boolean; error?: string }> = {}

    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(0)

      accessResults[table] = {
        accessible: !error || error.code === 'PGRST116', // PGRST116 = no rows, which is fine
        error: error?.message,
      }
    }

    const accessibleCount = Object.values(accessResults).filter((r) => r.accessible).length
    const inaccessibleTables = Object.entries(accessResults)
      .filter(([_, r]) => !r.accessible)
      .map(([table]) => table)

    if (inaccessibleTables.length > 0) {
      return {
        name: 'Table Access (RLS)',
        status: 'warning',
        message: `Some tables are not accessible (may be RLS or missing): ${inaccessibleTables.join(', ')}`,
        details: {
          accessible: accessibleCount,
          total: tables.length,
          accessResults,
        },
      }
    }

    return {
      name: 'Table Access (RLS)',
      status: 'pass',
      message: `All ${tables.length} tables are accessible`,
      details: {
        accessible: accessibleCount,
        total: tables.length,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Table Access (RLS)',
      status: 'fail',
      message: 'Table access test failed',
      details: { error: err.message },
    }
  }
}

/**
 * Test 7: Storage Buckets
 */
async function testStorageBuckets(): Promise<TestResult> {
  try {
    const supabase = await createClient()

    // Expected storage buckets
    const expectedBuckets = [
      'profile-pictures',
      'deposit-slips',
      'lease-documents',
      'maintenance-attachments',
      'organization-logos',
    ]

    const { data: buckets, error } = await supabase.storage.listBuckets()

    if (error) {
      return {
        name: 'Storage Buckets',
        status: 'warning',
        message: 'Cannot list storage buckets (may need authentication)',
        details: { error: error.message },
      }
    }

    const bucketNames = buckets?.map((b) => b.name) || []
    const missingBuckets = expectedBuckets.filter((b) => !bucketNames.includes(b))

    if (missingBuckets.length > 0) {
      return {
        name: 'Storage Buckets',
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
      name: 'Storage Buckets',
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
      name: 'Storage Buckets',
      status: 'warning',
      message: 'Storage test failed (may need authentication)',
      details: { error: err.message },
    }
  }
}

/**
 * Test 8: Database Tables Existence
 */
async function testDatabaseTables(): Promise<TestResult> {
  try {
    const adminClient = createAdminClient()

    // Expected tables from schema
    const expectedTables = [
      'organizations',
      'organization_members',
      'user_profiles',
      'apartment_buildings',
      'apartment_units',
      'leases',
      'invoices',
      'payments',
      'maintenance_requests',
      'communications',
      'reminders',
      'water_bills',
      'reports',
      'bulk_unit_creation_logs',
      'mpesa_verification_audit',
    ]

    const existingTables: string[] = []
    const missingTables: string[] = []

    for (const table of expectedTables) {
      const { error } = await adminClient.from(table).select('id').limit(0)

      if (error) {
        // Check if it's a "table doesn't exist" error
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          missingTables.push(table)
        } else {
          // Other errors (like RLS) mean table exists
          existingTables.push(table)
        }
      } else {
        existingTables.push(table)
      }
    }

    if (missingTables.length > 0) {
      return {
        name: 'Database Tables',
        status: 'warning',
        message: `Some tables are missing: ${missingTables.join(', ')}`,
        details: {
          existing: existingTables.length,
          missing: missingTables.length,
          total: expectedTables.length,
          missingTables,
        },
      }
    }

    return {
      name: 'Database Tables',
      status: 'pass',
      message: `All ${expectedTables.length} expected tables exist`,
      details: {
        existing: existingTables.length,
        total: expectedTables.length,
      },
    }
  } catch (error) {
    const err = error as Error
    return {
      name: 'Database Tables',
      status: 'fail',
      message: 'Database tables test failed',
      details: { error: err.message },
    }
  }
}

