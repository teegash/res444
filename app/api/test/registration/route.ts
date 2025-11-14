import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Diagnostic endpoint to test registration components
 * This helps identify where timeouts are occurring
 */
export async function GET(request: NextRequest) {
  const results: any[] = []
  let overallSuccess = true

  try {
    // Test 1: Environment variables
    console.log('Test 1: Checking environment variables...')
    const envTest = {
      name: 'Environment Variables',
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    }
    results.push(envTest)
    if (!envTest.hasUrl || !envTest.hasAnonKey || !envTest.hasServiceKey) {
      overallSuccess = false
    }

    // Test 2: Admin client creation
    console.log('Test 2: Creating admin client...')
    const startAdminClient = Date.now()
    const adminClient = createAdminClient()
    const adminClientTime = Date.now() - startAdminClient
    results.push({
      name: 'Admin Client Creation',
      success: true,
      timeMs: adminClientTime,
    })

    // Test 3: Simple database query
    console.log('Test 3: Testing database connection...')
    const startDbQuery = Date.now()
    const { data: testData, error: testError } = await adminClient
      .from('organizations')
      .select('id')
      .limit(1)
    const dbQueryTime = Date.now() - startDbQuery
    results.push({
      name: 'Database Query',
      success: !testError,
      timeMs: dbQueryTime,
      error: testError?.message,
    })
    if (testError) overallSuccess = false

    // Test 4: Auth admin API
    console.log('Test 4: Testing auth admin API...')
    const startAuthTest = Date.now()
    try {
      // Try to get a non-existent user (should return null, not error)
      const { data: authData, error: authError } = await adminClient.auth.admin.getUserByEmail(
        `nonexistent-${Date.now()}@test.com`
      )
      const authTestTime = Date.now() - startAuthTest
      results.push({
        name: 'Auth Admin API',
        success: !authError,
        timeMs: authTestTime,
        error: authError?.message,
      })
      if (authError) overallSuccess = false
    } catch (authTestError: any) {
      const authTestTime = Date.now() - startAuthTest
      results.push({
        name: 'Auth Admin API',
        success: false,
        timeMs: authTestTime,
        error: authTestError.message,
      })
      overallSuccess = false
    }

    // Test 5: Simulate signUp call (with test email)
    console.log('Test 5: Testing signUp operation (will not complete)...')
    const testEmail = `test-diagnostic-${Date.now()}@test.com`
    const startSignUp = Date.now()
    try {
      // Set a 10 second timeout for this test
      const signUpPromise = adminClient.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: {
            full_name: 'Test User',
            phone: '+254700000000',
            role: 'admin',
          },
        },
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SignUp test timed out after 10 seconds')), 10000)
      )

      const signUpResult = await Promise.race([signUpPromise, timeoutPromise])
      const signUpTime = Date.now() - startSignUp

      // Clean up: delete the test user if created
      if ((signUpResult as any).data?.user?.id) {
        await adminClient.auth.admin.deleteUser((signUpResult as any).data.user.id)
      }

      results.push({
        name: 'SignUp Operation',
        success: true,
        timeMs: signUpTime,
        note: 'Test user created and deleted successfully',
      })
    } catch (signUpError: any) {
      const signUpTime = Date.now() - startSignUp
      results.push({
        name: 'SignUp Operation',
        success: false,
        timeMs: signUpTime,
        error: signUpError.message,
        note: 'This is the likely cause of registration timeouts',
      })
      overallSuccess = false
    }

    return NextResponse.json({
      success: overallSuccess,
      message: overallSuccess
        ? 'All tests passed'
        : 'Some tests failed - check details',
      timestamp: new Date().toISOString(),
      results,
    })
  } catch (error) {
    const err = error as Error
    return NextResponse.json(
      {
        success: false,
        error: 'Test suite failed',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        results,
      },
      { status: 500 }
    )
  }
}

