import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { roleCanAccessRoute, UserRole } from './lib/rbac/roles'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow API routes to bypass Supabase auth checks completely to avoid any delays
  // This is critical for registration API which needs to run without interference
  if (pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require authentication
  const publicPaths = ['/', '/auth/login', '/auth/signup', '/auth/callback', '/auth/forgot-password', '/auth/reset-password']
  const isPublicPath = publicPaths.some((path) => pathname === path)

  // Auth routes
  const authPaths = ['/auth/login', '/auth/signup']
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path))

  // Protected routes (dashboard and all sub-routes)
  const isProtectedPath = pathname.startsWith('/dashboard')

  // Redirect to login if accessing protected route without auth
  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Allow login page even if authenticated - let login page handle redirect
  // This prevents redirect loops when user logs in
  // Only redirect from signup page if authenticated
  if (pathname === '/auth/signup' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Role-based route protection for dashboard routes
  if (isProtectedPath && user) {
    // Allow access to setup page for users without roles or organizations
    if (pathname === '/dashboard/setup' || pathname === '/dashboard/setup/organization') {
      return supabaseResponse
    }

    try {
      // Proxy should be FAST - just get role and check access
      // Use metadata first (no database query) - fastest!
      let userRole: UserRole | null = (user.user_metadata?.role as UserRole) || null
      
      // If metadata doesn't have role, try profile query with very short timeout
      // But don't wait - use metadata as primary source
      if (!userRole) {
        try {
          const profileQuery = supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
          
          // Very short timeout - 1 second max (proxy should be fast!)
          const profileTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile query timed out')), 1000)
          )
          
          const { data: profile } = await Promise.race([
            profileQuery,
            profileTimeout
          ]) as any
          
          if (profile?.role) {
            userRole = profile.role as UserRole
          }
        } catch (queryError: any) {
          // Profile query failed - that's okay, use metadata or redirect
        }
      }

      // If still no role, redirect to setup
      if (!userRole) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard/setup'
        return NextResponse.redirect(url)
      }

      // Check if admin (owner) has organization
      // Use very short timeout - proxy should be fast!
      if (userRole === 'admin') {
        try {
          const membershipQuery = supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .maybeSingle()
          
          // Very short timeout - 1 second max (proxy should be fast!)
          const membershipTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Membership query timed out')), 1000)
          )
          
          const { data: membership } = await Promise.race([
            membershipQuery,
            membershipTimeout
          ]) as any
          
          if (!membership || !membership.organization_id) {
            // Admin without organization - redirect to organization setup
            const url = request.nextUrl.clone()
            url.pathname = '/dashboard/setup/organization'
            return NextResponse.redirect(url)
          }
        } catch (membershipError: any) {
          // Membership query failed - allow access, will be created later if needed
          // Don't log or wait - just continue
        }
      }

      // Check if user's role can access this route
      if (!roleCanAccessRoute(userRole, pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/unauthorized'
        url.searchParams.set('reason', 'insufficient_permissions')
        url.searchParams.set('role', userRole)
        url.searchParams.set('path', pathname)
        return NextResponse.redirect(url)
      }

      // Add user role to response headers for use in pages
      supabaseResponse.headers.set('x-user-role', userRole)
    } catch (error) {
      console.error('Error checking user role in proxy:', error)
      // On error, allow access but log it
      // In production, you might want to redirect to unauthorized
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
