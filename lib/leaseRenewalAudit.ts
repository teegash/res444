type AdminClient = any

export async function logLeaseRenewalEvent(
  admin: AdminClient,
  args: {
    renewal_id: string
    organization_id: string
    actor_user_id?: string | null
    action: string
    metadata?: any
    ip?: string | null
    user_agent?: string | null
  }
) {
  const { error } = await admin.from('lease_renewal_events').insert({
    renewal_id: args.renewal_id,
    organization_id: args.organization_id,
    actor_user_id: args.actor_user_id ?? null,
    action: args.action,
    metadata: args.metadata ?? {},
    ip: args.ip ?? null,
    user_agent: args.user_agent ?? null,
  })

  if (error) throw new Error(error.message)
}

