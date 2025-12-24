import { cookies } from 'next/headers'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createSupabaseSsrClient } from '@/lib/supabase/server'

type SupabaseUser = { id: string; email?: string | null }

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createSupabaseJsClient(url, anon, { auth: { persistSession: false } })
}

function extractAccessTokenFromAuthCookieValue(raw: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })()

  try {
    const parsed = JSON.parse(decoded)
    if (parsed?.access_token) return String(parsed.access_token)
  } catch {
    return null
  }

  return null
}

async function extractAccessTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies()

  const direct = cookieStore.get('sb-access-token')?.value
  if (direct) return direct

  const all = cookieStore.getAll()
  const authCookie = all.find((c) => c.name.includes('-auth-token') && c.value)
  if (!authCookie?.value) return null

  return extractAccessTokenFromAuthCookieValue(authCookie.value)
}

export async function requireSupabaseUserFromCookies(): Promise<SupabaseUser> {
  // Preferred path: your existing SSR client (works with your current cookie/session setup)
  try {
    const supabase = await createSupabaseSsrClient()
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email }
    }
  } catch {
    // fall through to token parsing
  }

  // Fallback: parse access token cookie and validate it with anon key.
  const accessToken = await extractAccessTokenFromCookies()
  if (!accessToken) throw new Error('Unauthorized')

  const sb = supabaseAnon()
  const { data, error } = await sb.auth.getUser(accessToken)
  if (error || !data.user) throw new Error('Unauthorized')

  return { id: data.user.id, email: data.user.email }
}

