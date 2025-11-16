import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
const redirectUrl = SITE_URL ? `${SITE_URL.replace(/\/$/, '')}/tenant/welcome` : undefined

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      full_name,
      email,
      phone_number,
      national_id,
      profile_picture_url,
      address,
      date_of_birth,
      unit_id,
    } = body || {}

    if (!full_name || !email || !phone_number || !national_id) {
      return NextResponse.json(
        { success: false, error: 'Full name, email, phone number, and national ID are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    const { data: existingProfile } = await adminSupabase
      .from('user_profiles')
      .select('id')
      .eq('national_id', national_id)
      .maybeSingle()

    if (existingProfile) {
      return NextResponse.json(
        { success: false, error: 'A tenant with that national ID already exists.' },
        { status: 409 }
      )
    }

    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { role: 'tenant' },
        redirectTo: redirectUrl,
      }
    )

    if (inviteError || !inviteData?.user?.id) {
      throw inviteError || new Error('Failed to send tenant invite.')
    }

    const tenantUserId = inviteData.user.id

    const { error: profileError } = await adminSupabase.from('user_profiles').insert({
      id: tenantUserId,
      full_name,
      phone_number,
      national_id,
      profile_picture_url: profile_picture_url || null,
      address: address || null,
      date_of_birth: date_of_birth || null,
      role: 'tenant',
    })

    if (profileError) {
      console.error('[TenantCreate] profile insert failed', profileError)
      return NextResponse.json(
        { success: false, error: profileError.message || 'Failed to save tenant profile.' },
        { status: 500 }
      )
    }

    if (unit_id) {
      const { data: unit, error: unitError } = await adminSupabase
        .from('apartment_units')
        .select('id, unit_price_category')
        .eq('id', unit_id)
        .maybeSingle()

      if (unitError || !unit) {
        console.error('[TenantCreate] unit fetch failed', unitError)
        return NextResponse.json(
          { success: false, error: 'Selected unit could not be found.' },
          { status: 400 }
        )
      }

      const numericRent = unit.unit_price_category?.replace(/[^0-9.]/g, '') || ''
      const monthlyRent = numericRent ? Number(numericRent) : 0
      const today = new Date().toISOString().split('T')[0]

      const { error: leaseError } = await adminSupabase.from('leases').insert({
        unit_id,
        tenant_user_id: tenantUserId,
        start_date: today,
        monthly_rent: monthlyRent,
        deposit_amount: null,
        status: 'pending',
        lease_agreement_url: null,
        rent_auto_populated: true,
        lease_auto_generated: true,
      })

      if (leaseError) {
        console.error('[TenantCreate] lease insert failed', leaseError)
        return NextResponse.json(
          { success: false, error: leaseError.message || 'Failed to create tenant lease.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TenantCreate] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unexpected error occurred.' },
      { status: 500 }
    )
  }
}
