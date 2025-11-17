import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: {
    id: string
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const payload = await request.json().catch(() => ({}))
  const {
    full_name,
    phone_number,
    national_id,
    address,
    date_of_birth,
    tenant_user_id,
  }: Record<string, string | null | undefined> = payload || {}

  const tenantId = params?.id || tenant_user_id

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    if (
      !full_name &&
      !phone_number &&
      !national_id &&
      typeof address === 'undefined' &&
      typeof date_of_birth === 'undefined'
    ) {
      return NextResponse.json(
        { success: false, error: 'No editable fields were provided.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()

    const profileUpdate: Record<string, string | null | undefined> = {}
    if (full_name !== undefined) profileUpdate.full_name = full_name
    if (phone_number !== undefined) profileUpdate.phone_number = phone_number
    if (national_id !== undefined) profileUpdate.national_id = national_id
    if (address !== undefined) profileUpdate.address = address ?? null
    if (date_of_birth !== undefined) profileUpdate.date_of_birth = date_of_birth || null

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminSupabase
        .from('user_profiles')
        .update(profileUpdate)
        .eq('id', tenantId)

      if (profileError) {
        throw profileError
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tenants.PUT] Failed to update tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update tenant.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.auth.admin.deleteUser(tenantId)
    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tenants.DELETE] Failed to delete tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete tenant.' },
      { status: 500 }
    )
  }
}
