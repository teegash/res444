'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type MpesaSettings = {
  id: string
  organization_id?: string | null
  auto_verify_enabled: boolean
  auto_verify_frequency_seconds: number
  max_retries: number
  query_timeout_seconds: number
  last_tested_at: string | null
  last_test_status: string | null
  updated_at: string | null
  updated_by: string | null
  created_at: string | null
}

const DEFAULT_SETTINGS = {
  auto_verify_enabled: true,
  auto_verify_frequency_seconds: 30,
  max_retries: 3,
  query_timeout_seconds: 30,
}

export async function getMpesaSettings(orgId?: string | null) {
  const supabase = createAdminClient()
  let data: any = null
  let error: any = null

  if (orgId) {
    const response = await supabase
      .from('mpesa_settings')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    data = response.data
    error = response.error

    if (error) {
      const message = (error.message || '').toLowerCase()
      if (!message.includes('organization_id')) {
        console.error('[MpesaSettings] Failed to load settings:', error.message)
        throw new Error('Failed to load M-Pesa settings')
      }
      data = null
      error = null
    }
  }

  if (!data && !error) {
    const response = await supabase
      .from('mpesa_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    data = response.data
    error = response.error
  }

  if (error) {
    console.error('[MpesaSettings] Failed to load settings:', error.message)
    throw new Error('Failed to load M-Pesa settings')
  }

  if (data) {
    return data as MpesaSettings
  }

  let inserted: any = null
  let insertError: any = null

  if (orgId) {
    const insertResponse = await supabase
      .from('mpesa_settings')
      .insert({ ...DEFAULT_SETTINGS, organization_id: orgId })
      .select('*')
      .single()
    inserted = insertResponse.data
    insertError = insertResponse.error

    if (insertError) {
      const message = (insertError.message || '').toLowerCase()
      if (message.includes('organization_id')) {
        inserted = null
        insertError = null
      }
    }
  }

  if (!inserted && !insertError) {
    const insertResponse = await supabase
      .from('mpesa_settings')
      .insert(DEFAULT_SETTINGS)
      .select('*')
      .single()
    inserted = insertResponse.data
    insertError = insertResponse.error
  }

  if (insertError || !inserted) {
    console.error('[MpesaSettings] Failed to create default settings:', insertError?.message)
    throw new Error('Failed to initialize M-Pesa settings')
  }

  return inserted as MpesaSettings
}

export async function updateMpesaSettings(
  updatedBy: string,
  updates: Partial<
    Pick<
      MpesaSettings,
      | 'auto_verify_enabled'
      | 'auto_verify_frequency_seconds'
      | 'max_retries'
      | 'query_timeout_seconds'
      | 'last_tested_at'
      | 'last_test_status'
    >
  >,
  orgId?: string | null
) {
  const supabase = createAdminClient()
  const current = await getMpesaSettings(orgId)

  const payload = {
    ...updates,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }

  let data: any = null
  let error: any = null

  if (orgId) {
    const response = await supabase
      .from('mpesa_settings')
      .update(payload)
      .eq('organization_id', orgId)
      .select('*')
      .single()
    data = response.data
    error = response.error

    if (error) {
      const message = (error.message || '').toLowerCase()
      if (!message.includes('organization_id')) {
        console.error('[MpesaSettings] Failed to update settings:', error?.message)
        throw new Error('Failed to update M-Pesa settings')
      }
      data = null
      error = null
    }
  }

  if (!data && !error) {
    const response = await supabase
      .from('mpesa_settings')
      .update(payload)
      .eq('id', current.id)
      .select('*')
      .single()
    data = response.data
    error = response.error
  }

  if (error || !data) {
    console.error('[MpesaSettings] Failed to update settings:', error?.message)
    throw new Error('Failed to update M-Pesa settings')
  }

  return data as MpesaSettings
}
