'use server'

import { createClient } from '@/lib/supabase/server'

function baseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

function requireInternalKey() {
  const key = process.env.INTERNAL_API_KEY
  if (!key) throw new Error('Server misconfigured: INTERNAL_API_KEY missing')
  return key
}

export async function createRenewal(leaseId: string) {
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(leaseId)}/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  return await res.json()
}

export async function tenantSignRenewal(renewalId: string) {
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(renewalId)}/tenant-sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  return await res.json()
}

export async function managerSignRenewal(renewalId: string) {
  const key = requireInternalKey()
  const res = await fetch(`${baseUrl()}/api/lease-renewals/${encodeURIComponent(renewalId)}/manager-sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  return await res.json()
}

export async function getCurrentUserId() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

