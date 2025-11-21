'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type MpesaSettings = {
  id: string
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

export async function getMpesaSettings() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('mpesa_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[MpesaSettings] Failed to load settings:', error.message)
    throw new Error('Failed to load M-Pesa settings')
  }

  if (data) {
    return data as MpesaSettings
  }

  const { data: inserted, error: insertError } = await supabase
    .from('mpesa_settings')
    .insert(DEFAULT_SETTINGS)
    .select('*')
    .single()

  if (insertError || !inserted) {
    console.error('[MpesaSettings] Failed to create default settings:', insertError?.message)
    throw new Error('Failed to initialize M-Pesa settings')
  }

  return inserted as MpesaSettings
}

export async function updateMpesaSettings(
  updatedBy: string,
  updates: Partial<Pick<MpesaSettings, 'auto_verify_enabled' | 'auto_verify_frequency_seconds' | 'max_retries' | 'query_timeout_seconds' | 'last_tested_at' | 'last_test_status'>>
) {
  const supabase = createAdminClient()
  const current = await getMpesaSettings()

  const payload = {
    ...updates,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('mpesa_settings')
    .update(payload)
    .eq('id', current.id)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[MpesaSettings] Failed to update settings:', error?.message)
    throw new Error('Failed to update M-Pesa settings')
  }

  return data as MpesaSettings
}
