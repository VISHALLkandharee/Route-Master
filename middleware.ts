import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import { differenceInDays } from 'date-fns'

const PROTECTED_ROUTES = ['/dashboard', '/onboarding']
const AUTH_ROUTES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    path.startsWith(route)
  )
  const isAuthRoute = AUTH_ROUTES.some((route) => path.startsWith(route))

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Trial enforcement — only on dashboard pages that are NOT settings
  if (
    user &&
    path.startsWith('/dashboard') &&
    !path.startsWith('/dashboard/settings')
  ) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: profile } = await supabase
      .from('users')
      .select('subscription_status, trial_ends_at')
      .single()

    if (profile) {
      const trialDaysLeft = differenceInDays(
        new Date(profile.trial_ends_at),
        new Date()
      )
      const isBlocked =
        profile.subscription_status === 'cancelled' ||
        (profile.subscription_status === 'trial' && trialDaysLeft < 0) ||
        profile.subscription_status === 'unpaid'

      if (isBlocked) {
        return NextResponse.redirect(
          new URL('/dashboard/settings?upgrade=true', request.url)
        )
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}