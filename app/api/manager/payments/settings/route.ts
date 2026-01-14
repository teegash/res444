import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMpesaSettings, updateMpesaSettings, MpesaSettings } from '@/lib/mpesa/settings'

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

const normalize = (settings: MpesaSettings) => ({
  autoVerifyEnabled: settings.auto_verify_enabled,
  autoVerifyFrequencySeconds: settings.auto_verify_frequency_seconds,
  maxRetries: settings.max_retries,
  queryTimeoutSeconds: settings.query_timeout_seconds,
  lastTestedAt: settings.last_tested_at,
  lastTestStatus: settings.last_test_status,
  updatedAt: settings.updated_at,
  updatedBy: settings.updated_by,
})

export async function GET() {
  const auth = await requireManager()
  if ('error' in auth) {
    return auth.error
  }

  const settings = await getMpesaSettings(auth.organizationId)
  return NextResponse.json({
    success: true,
    data: normalize(settings),
  })
}

export async function PUT(request: NextRequest) {
  const auth = await requireManager()
  if ('error' in auth) {
    return auth.error
  }

  try {
    const body = await request.json()
    const updates: Record<string, any> = {}

    if (body.autoVerifyEnabled !== undefined) {
      updates.auto_verify_enabled = Boolean(body.autoVerifyEnabled)
    }

    if (body.autoVerifyFrequencySeconds !== undefined) {
      const value = Number(body.autoVerifyFrequencySeconds)
      if (!Number.isFinite(value) || value < 15 || value > 300) {
        return NextResponse.json(
          { success: false, error: 'Frequency must be between 15 and 300 seconds.' },
          { status: 400 }
        )
      }
      updates.auto_verify_frequency_seconds = Math.round(value)
    }

    if (body.maxRetries !== undefined) {
      const retries = Number(body.maxRetries)
      if (!Number.isFinite(retries) || retries < 1 || retries > 6) {
        return NextResponse.json(
          { success: false, error: 'Max retries must be between 1 and 6.' },
          { status: 400 }
        )
      }
      updates.max_retries = Math.round(retries)
    }

    if (body.queryTimeoutSeconds !== undefined) {
      const timeout = Number(body.queryTimeoutSeconds)
      if (!Number.isFinite(timeout) || timeout < 15 || timeout > 120) {
        return NextResponse.json(
          { success: false, error: 'Query timeout must be between 15 and 120 seconds.' },
          { status: 400 }
        )
      }
      updates.query_timeout_seconds = Math.round(timeout)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid settings supplied.' },
        { status: 400 }
      )
    }

    const updated = await updateMpesaSettings(auth.user.id, updates, auth.organizationId)

    return NextResponse.json({
      success: true,
      data: normalize(updated),
    })
  } catch (error) {
    const err = error as Error
    console.error('[PaymentsSettings] Failed to update settings:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update settings' },
      { status: 500 }
    )
  }
}
