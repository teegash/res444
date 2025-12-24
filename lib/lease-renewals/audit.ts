import type { SupabaseClient } from '@supabase/supabase-js'

export async function logLeaseRenewalEvent(
  supabase: SupabaseClient,
  args: {
    renewalId: string
    organizationId: string
    actorUserId?: string | null
    action: string
    metadata?: any
    ip?: string | null
    userAgent?: string | null
  }
) {
  await supabase.from('lease_renewal_events').insert({
    renewal_id: args.renewalId,
    organization_id: args.organizationId,
    actor_user_id: args.actorUserId ?? null,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
  })
}

export function getRequestAuditMeta(req: Request) {
  return {
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  }
}

