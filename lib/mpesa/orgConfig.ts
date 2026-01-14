import { createAdminClient } from '@/lib/supabase/admin'
import type { DarajaConfig } from './daraja'

export type OrgDarajaConfig = DarajaConfig & {
  organizationId: string
  callbackSecret: string
}

export async function getOrgDarajaConfig(organizationId: string): Promise<OrgDarajaConfig | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from('mpesa_credentials')
    .select('consumer_key, consumer_secret, stk_shortcode, stk_passkey, callback_secret, environment, is_enabled')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data || data.is_enabled !== true) return null

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://res.co.ke'
  const callbackUrl = `${siteUrl.replace(/\/$/, '')}/api/payments/mpesa/callback/${organizationId}/${data.callback_secret}`

  return {
    organizationId,
    callbackSecret: data.callback_secret,
    consumerKey: data.consumer_key,
    consumerSecret: data.consumer_secret,
    businessShortCode: data.stk_shortcode,
    passKey: data.stk_passkey,
    callbackUrl,
    environment: (data.environment as 'sandbox' | 'production') || 'sandbox',
  }
}
