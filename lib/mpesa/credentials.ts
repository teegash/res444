import { createAdminClient } from '@/lib/supabase/admin'
import type { DarajaConfig } from '@/lib/mpesa/daraja'

export type MpesaCredentials = {
  organizationId: string
  consumerKey: string
  consumerSecret: string
  passKey: string
  businessShortCode: string
  callbackSecret: string
  environment: 'sandbox' | 'production'
  initiatorName?: string | null
  securityCredential?: string | null
  isEnabled: boolean
}

function asString(value: unknown) {
  const str = typeof value === 'string' ? value.trim() : ''
  return str.length > 0 ? str : null
}

export function buildCallbackUrl(orgId: string, secret: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/payments/mpesa/callback/${encodeURIComponent(
    orgId
  )}/${encodeURIComponent(secret)}`
}

export function normalizeMpesaCredentials(raw: any): MpesaCredentials | null {
  if (!raw) return null
  const orgId = asString(raw.organization_id)
  const consumerKey = asString(raw.consumer_key ?? raw.consumerKey)
  const consumerSecret = asString(raw.consumer_secret ?? raw.consumerSecret)
  const passKey = asString(raw.pass_key ?? raw.passkey ?? raw.passKey)
  const businessShortCode = asString(raw.business_short_code ?? raw.shortcode ?? raw.businessShortCode)
  const callbackSecret = asString(raw.callback_secret ?? raw.callbackSecret)
  const environmentRaw = asString(raw.environment ?? raw.daraja_environment)
  const environment = environmentRaw === 'production' ? 'production' : 'sandbox'
  const initiatorName = asString(raw.initiator_name ?? raw.initiatorName)
  const securityCredential = asString(raw.security_credential ?? raw.securityCredential)
  const isEnabled = raw.is_enabled !== undefined ? Boolean(raw.is_enabled) : true

  if (!orgId || !consumerKey || !consumerSecret || !passKey || !businessShortCode || !callbackSecret) {
    return null
  }

  return {
    organizationId: orgId,
    consumerKey,
    consumerSecret,
    passKey,
    businessShortCode,
    callbackSecret,
    environment,
    initiatorName,
    securityCredential,
    isEnabled,
  }
}

export async function getMpesaCredentials(orgId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mpesa_credentials')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeMpesaCredentials(data)
}

export function buildDarajaConfig(creds: MpesaCredentials, callbackUrl: string): DarajaConfig {
  return {
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    businessShortCode: creds.businessShortCode,
    passKey: creds.passKey,
    callbackUrl,
    environment: creds.environment,
  }
}
