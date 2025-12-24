'use server'

import { createClient } from '@/lib/supabase/server'

function baseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

async function requireActorFromSession() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Unauthorized')
  return data.user.id
}

function requireInternalKey() {
  const key = process.env.INTERNAL_API_KEY
  if (!key) throw new Error('Server misconfigured: INTERNAL_API_KEY missing')
  return key
}

export async function createLeaseRenewal(leaseId: string) {
  const actorUserId = await requireActorFromSession()
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(leaseId)}/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'x-actor-user-id': actorUserId,
    },
    cache: 'no-store',
  })
  return await res.json()
}

export async function tenantSignLeaseRenewal(renewalId: string) {
  const actorUserId = await requireActorFromSession()
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(renewalId)}/tenant-sign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'x-actor-user-id': actorUserId,
    },
    cache: 'no-store',
  })
  return await res.json()
}

export async function managerSignLeaseRenewal(renewalId: string) {
  const actorUserId = await requireActorFromSession()
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(renewalId)}/manager-sign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'x-actor-user-id': actorUserId,
    },
    cache: 'no-store',
  })
  return await res.json()
}

export async function getLeaseRenewalDownloadUrl(renewalId: string, type: 'unsigned' | 'tenant_signed' | 'fully_signed') {
  const actorUserId = await requireActorFromSession()
  const key = requireInternalKey()
  const res = await fetch(
    `${baseUrl()}/api/lease-renewals/${encodeURIComponent(renewalId)}/download?type=${encodeURIComponent(type)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'x-actor-user-id': actorUserId,
      },
      cache: 'no-store',
    }
  )
  return await res.json()
}

