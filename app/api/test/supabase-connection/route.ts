import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAllSupabaseTests } from '@/lib/supabase/test'

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
    }

    const missingEnv = Object.entries(envCheck)
      .filter(([_, value]) => !value)
      .map(([key]) => key)

    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing environment variables',
          missing: missingEnv,
          envCheck,
        },
        { status: 500 }
      )
    }

    // Test admin client creation
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create admin client',
          details: error.message,
          envCheck,
        },
        { status: 500 }
      )
    }

    // Test basic connection
    const { data: testData, error: testError } = await adminClient
      .from('organizations')
      .select('id')
      .limit(1)

    if (testError && testError.code !== 'PGRST116') {
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed',
          details: {
            message: testError.message,
            code: testError.code,
            hint: testError.hint,
          },
          envCheck,
        },
        { status: 500 }
      )
    }

    // Run comprehensive tests
    const testResults = await runAllSupabaseTests()

    return NextResponse.json(
      {
        success: testResults.success,
        message: testResults.success
          ? 'Supabase connection is working correctly'
          : 'Some tests failed - check details',
        envCheck,
        connectionTest: {
          status: 'pass',
          message: 'Admin client can query database',
        },
        comprehensiveTests: testResults,
        timestamp: new Date().toISOString(),
      },
      { status: testResults.success ? 200 : 500 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Test failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

