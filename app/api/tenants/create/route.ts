import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')

const buildRedirectUrl = (email: string) =>
  SITE_URL ? `${SITE_URL.replace(/\/$/, '')}/tenant/set-password?email=${encodeURIComponent(email)}` : undefined

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      full_name,
      email,
      phone_number,
      national_id,
      profile_picture_file,
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
        redirectTo: buildRedirectUrl(email),
      }
    )

    if (inviteError || !inviteData?.user?.id) {
      throw inviteError || new Error('Failed to send tenant invite.')
    }

    const tenantUserId = inviteData.user.id

    let uploadedProfileUrl: string | null = null

    if (typeof profile_picture_file === 'string' && profile_picture_file.startsWith('data:')) {
      const matches = profile_picture_file.match(/^data:(.+);base64,(.+)$/)
      if (matches) {
        const [, mimeType, base64Data] = matches
        const fileBuffer = Buffer.from(base64Data, 'base64')
        const extension = mimeType.split('/')[1] || 'jpg'
        const filePath = `tenant-profiles/${tenantUserId}-${Date.now()}.${extension}`
        const { error: uploadError } = await adminSupabase.storage
          .from('profile-pictures')
          .upload(filePath, fileBuffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: false,
          })
        if (uploadError) {
          console.error('[TenantCreate] profile upload failed', uploadError)
          return NextResponse.json(
            { success: false, error: uploadError.message || 'Failed to upload profile picture.' },
            { status: 500 }
          )
        }
        const { data: publicUrlData } = adminSupabase.storage
          .from('profile-pictures')
          .getPublicUrl(filePath)
        uploadedProfileUrl = publicUrlData?.publicUrl || null
      }
    }

    const { error: profileError } = await adminSupabase.from('user_profiles').upsert({
      id: tenantUserId,
      full_name,
      phone_number,
      national_id,
      profile_picture_url: uploadedProfileUrl,
      address: address || null,
      date_of_birth: date_of_birth || null,
      role: 'tenant',
    }, { onConflict: 'id' })

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
