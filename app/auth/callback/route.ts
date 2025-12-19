import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Return the user to an error page with instructions
  const loginUrl = new URL('/auth/login', request.url)
  loginUrl.searchParams.set('error', 'Could not authenticate')
  if (next.startsWith('/auth/reset-password')) {
    loginUrl.searchParams.set('flow', 'recovery')
  }
  return NextResponse.redirect(loginUrl)
}
