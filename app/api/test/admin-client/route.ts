import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Test endpoint to verify admin client can bypass RLS
 * This helps debug RLS issues
 */
export async function GET(request: NextRequest) {
  try {
    // Check if service role key is set
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!hasServiceRoleKey) {
      return NextResponse.json({
        success: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not set in environment variables',
        details: {
          hasKey: false,
        },
      }, { status: 500 })
    }

    const adminSupabase = createAdminClient()

    // Test 1: Try to list organizations (should work with admin client)
    const { data: orgs, error: listError } = await adminSupabase
      .from('organizations')
      .select('id, name')
      .limit(5)

    // Test 2: Try to insert a test organization (then delete it)
    const testOrgName = `test-${Date.now()}`
    const { data: testOrg, error: insertError } = await adminSupabase
      .from('organizations')
      .insert({
        name: testOrgName,
        email: `test-${Date.now()}@test.com`,
        location: 'Test Location',
        registration_number: `TEST-${Date.now()}`,
      })
      .select()
      .single()

    // If insert succeeded, delete the test org
    if (testOrg) {
      await adminSupabase
        .from('organizations')
        .delete()
        .eq('id', testOrg.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Admin client is working correctly',
      details: {
        hasServiceRoleKey: true,
        canListOrganizations: !listError,
        canInsertOrganizations: !insertError,
        listError: listError?.message,
        insertError: insertError?.message,
        insertErrorCode: insertError?.code,
        testOrgCreated: !!testOrg,
      },
    })
  } catch (error) {
    const err = error as Error
    return NextResponse.json({
      success: false,
      error: err.message,
      details: {
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }, { status: 500 })
  }
}

