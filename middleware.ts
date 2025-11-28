import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only gate access to the signup page
  if (pathname.startsWith('/auth/signup')) {
    const inviteCookie = req.cookies.get('invite_access')
    if (!inviteCookie) {
      const url = req.nextUrl.clone()
      url.pathname = '/get-started'
      url.searchParams.set('redirectTo', req.nextUrl.pathname + req.nextUrl.search)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/auth/signup'],
}
