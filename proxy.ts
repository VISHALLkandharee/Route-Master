import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getSubscriptionAccess } from '@/lib/subscription-access'

const PROTECTED_ROUTES = ['/dashboard', '/onboarding']
const AUTH_ROUTES = ['/login', '/signup']

function isPath(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const path = request.nextUrl.pathname
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => isPath(path, route))
  const isAuthRoute = AUTH_ROUTES.some((route) => isPath(path, route))

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthRoute && user) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    // Keep the auth page available if the profile is still being created or
    // cannot be read. Redirecting straight to /dashboard can form a loop when
    // the dashboard layout cannot load that profile.
    if (profile) {
      return NextResponse.redirect(
        new URL(profile.onboarding_completed ? '/dashboard' : '/onboarding', request.url),
      )
    }
  }

  // Keep billing settings reachable so users can resolve account issues.
  if (
    user &&
    isPath(path, '/dashboard') &&
    !isPath(path, '/dashboard/settings')
  ) {
    const access = await getSubscriptionAccess(supabase, user.id)

    if (access.status === 'blocked') {
      return NextResponse.redirect(
        new URL('/dashboard/settings?upgrade=true', request.url),
      )
    }

    if (access.status === 'unavailable') {
      return NextResponse.redirect(
        new URL('/dashboard/settings?billing=unavailable', request.url),
      )
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
