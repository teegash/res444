import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDarajaConfig } from '@/lib/mpesa/queryStatus'
import { getAccessToken } from '@/lib/mpesa/daraja'
import { updateMpesaSettings } from '@/lib/mpesa/settings'

const MANAGER_ROLES = ['admin', 'manager', 'caretaker'] as const

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  let organizationId = membership?.organization_id || null
  let role = membership?.role || null

  if (!organizationId || !role) {
    const { data: profile } = await admin
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .maybeSingle()
    organizationId = organizationId || profile?.organization_id || null
    role = role || profile?.role || null
  }

  if (!organizationId || !role || !MANAGER_ROLES.includes((role || '') as (typeof MANAGER_ROLES)[number])) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, organizationId }
}

export async function POST() {
  const auth = await requireManager()
  if ('error' in auth) {
    return auth.error
  }

  try {
    const config = getDarajaConfig()
    await getAccessToken(config.consumerKey, config.consumerSecret, config.environment)

    await updateMpesaSettings(auth.user.id, {
      last_tested_at: new Date().toISOString(),
      last_test_status: 'success',
    })

    return NextResponse.json({
      success: true,
      message: 'Daraja API connection successful.',
    })
  } catch (error) {
    const err = error as Error
    await updateMpesaSettings(auth.user.id, {
      last_tested_at: new Date().toISOString(),
      last_test_status: `failed: ${err.message}`,
    })

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to connect to Daraja API.',
      },
      { status: 500 }
    )
  }
}
