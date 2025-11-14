import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const results: any[] = []
  let overallSuccess = true

  try {
    // Test 1: Environment Variables
    const envStart = Date.now()
    const missingEnv: string[] = []
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnv.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missingEnv.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!process.env.NEXT_PUBLIC_SITE_URL) missingEnv.push('NEXT_PUBLIC_SITE_URL')

    results.push({
      name: 'Environment Variables',
      status: missingEnv.length === 0 ? 'pass' : 'fail',
      timeMs: Date.now() - envStart,
      message: missingEnv.length === 0 
        ? 'All required env vars present' 
        : `Missing: ${missingEnv.join(', ')}`,
    })

    if (missingEnv.length > 0) {
      overallSuccess = false
      return NextResponse.json({ success: false, results }, { status: 500 })
    }

    // Test 2: Admin Client Creation
    const adminStart = Date.now()
    let adminClient
    try {
      adminClient = createAdminClient()
      results.push({
        name: 'Admin Client Creation',
        status: 'pass',
        timeMs: Date.now() - adminStart,
        message: 'Admin client created successfully',
      })
    } catch (err: any) {
      overallSuccess = false
      results.push({
        name: 'Admin Client Creation',
        status: 'fail',
        timeMs: Date.now() - adminStart,
        message: `Failed: ${err.message}`,
      })
      return NextResponse.json({ success: false, results }, { status: 500 })
    }

    // Test 3: Database Connection (simple query)
    const dbStart = Date.now()
    try {
      const { error } = await adminClient.from('organizations').select('id').limit(0)
      const dbTime = Date.now() - dbStart
      
      if (error && error.code !== 'PGRST116') {
        overallSuccess = false
        results.push({
          name: 'Database Connection',
          status: 'fail',
          timeMs: dbTime,
          message: `Query failed: ${error.message}`,
        })
      } else {
        results.push({
          name: 'Database Connection',
          status: 'pass',
          timeMs: dbTime,
          message: `Database query successful (${dbTime}ms)`,
        })
      }
    } catch (err: any) {
      overallSuccess = false
      results.push({
        name: 'Database Connection',
        status: 'fail',
        timeMs: Date.now() - dbStart,
        message: `Failed: ${err.message}`,
      })
    }

    // Test 4: Auth Admin API (getUserByEmail)
    const authStart = Date.now()
    try {
      const testEmail = `test-${Date.now()}@example.com`
      await adminClient.auth.admin.getUserByEmail(testEmail)
      const authTime = Date.now() - authStart
      
      results.push({
        name: 'Auth Admin API',
        status: 'pass',
        timeMs: authTime,
        message: `Auth admin API responded (${authTime}ms)`,
      })
    } catch (err: any) {
      // 404 is expected for non-existent user
      const authTime = Date.now() - authStart
      if (err.status === 404) {
        results.push({
          name: 'Auth Admin API',
          status: 'pass',
          timeMs: authTime,
          message: `Auth admin API responded (${authTime}ms)`,
        })
      } else {
        overallSuccess = false
        results.push({
          name: 'Auth Admin API',
          status: 'fail',
          timeMs: authTime,
          message: `Failed: ${err.message}`,
        })
      }
    }

    // Test 5: SignUp Operation (actual test)
    const signUpStart = Date.now()
    const testEmail = `speedtest-${Date.now()}@example.com`
    const testPassword = 'TestPassword123!'
    
    try {
      const signUpPromise = adminClient.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: {
            full_name: 'Speed Test User',
            phone: '+254700000000',
            role: 'admin',
          },
        },
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SignUp timed out after 10 seconds')), 10000)
      )

      const signUpResult = await Promise.race([signUpPromise, timeoutPromise]) as any
      const signUpTime = Date.now() - signUpStart

      // Clean up test user
      if (signUpResult?.data?.user?.id) {
        try {
          await adminClient.auth.admin.deleteUser(signUpResult.data.user.id)
        } catch (deleteError) {
          console.warn('Failed to delete test user:', deleteError)
        }
      }

      results.push({
        name: 'SignUp Operation',
        status: 'pass',
        timeMs: signUpTime,
        message: `SignUp completed successfully (${signUpTime}ms)`,
        details: {
          userCreated: !!signUpResult?.data?.user,
          hasError: !!signUpResult?.error,
          errorMessage: signUpResult?.error?.message,
        },
      })

      if (signUpTime > 10000) {
        results.push({
          name: 'SignUp Speed Warning',
          status: 'warning',
          timeMs: signUpTime,
          message: `SignUp took ${signUpTime}ms - exceeds Vercel Hobby plan limit (10s)`,
          recommendation: 'Consider upgrading to Vercel Pro plan or optimizing Supabase connection',
        })
      }

    } catch (signUpError: any) {
      const signUpTime = Date.now() - signUpStart
      overallSuccess = false
      
      results.push({
        name: 'SignUp Operation',
        status: 'fail',
        timeMs: signUpTime,
        message: `SignUp failed or timed out: ${signUpError.message}`,
        details: {
          elapsed: signUpTime,
          error: signUpError.message,
          recommendation: signUpTime > 10000 
            ? 'SignUp is taking too long - check Supabase connection or upgrade Vercel plan'
            : 'Check Supabase configuration and network connection',
        },
      })
    }

    // Summary
    const totalTime = results.reduce((sum, r) => sum + (r.timeMs || 0), 0)
    const failedTests = results.filter(r => r.status === 'fail').length
    const warnings = results.filter(r => r.status === 'warning').length

    return NextResponse.json({
      success: overallSuccess && failedTests === 0,
      status: failedTests > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass',
      totalTimeMs: totalTime,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'pass').length,
        failed: failedTests,
        warnings: warnings,
      },
      recommendations: failedTests > 0 || warnings > 0
        ? [
            'Check Supabase connection and network latency',
            'Verify environment variables are set correctly',
            'Consider upgrading to Vercel Pro plan for 60s timeout',
            'Check Supabase dashboard for service issues',
            'Verify database trigger is active',
          ]
        : ['All tests passed - registration should work correctly'],
      timestamp: new Date().toISOString(),
    }, { status: overallSuccess && failedTests === 0 ? 200 : 500 })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      status: 'fail',
      error: 'Test suite failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      results,
    }, { status: 500 })
  }
}

