'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    console.error(
      '[Supabase Client] Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )

    return createBrowserClient<Database>(
      'https://placeholder.supabase.co',
      'public-anon-key'
    )
  }

  return createBrowserClient<Database>(supabaseUrl, anonKey)
}
