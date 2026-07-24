import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import { differenceInDays } from 'date-fns'

const PROTECTED_ROUTES = ['/dashboard', '/onboarding']
const AUTH_ROUTES = ['/login', '/signup']

// ── Subscription status cache cookie ────────────────────────────
// Instead of hitting the DB on every request, we cache the result
// in a short-lived cookie. This eliminates the per-request DB query
// while still enforcing trial/billing status quickly.
const SUBSCRIPTION_COOKIE = 'rm_sub_status'
const COOKIE_MAX_AGE = 5 * 60 // 5 minutes (seconds)

type CachedStatus = {
  status: string
  trial_ends_at: string
}

function parseCachedStatus(cookieValue: string | undefined): CachedStatus | null {
  if (!cookieValue) return null
  try {
    return JSON.parse(decodeURIComponent(cookieValue)) as CachedStatus
  } catch {
    return null
  }
}

function isBlocked(status: string, trial_ends_at: string): boolean {
  const trialDaysLeft = differenceInDays(new Date(trial_ends_at), new Date())
  return (
    status === 'cancelled' ||
    status === 'unpaid' ||
    (status === 'trial' && trialDaysLeft < 0)
  )
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    path.startsWith(route)
  )
  const isAuthRoute = AUTH_ROUTES.some((route) => path.startsWith(route))

  // ── Unauthenticated → redirect to login ──────────────────────
  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Authenticated on auth pages → redirect to dashboard ──────
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Trial / billing enforcement (dashboard only) ─────────────
  // Skip the settings page so the user can always reach billing.
  if (
    user &&
    path.startsWith('/dashboard') &&
    !path.startsWith('/dashboard/settings')
  ) {
    // 1️⃣ Try to use the cached cookie first (avoids a DB round-trip)
    const cachedRaw = request.cookies.get(SUBSCRIPTION_COOKIE)?.value
    const cached = parseCachedStatus(cachedRaw)

    if (cached) {
      if (isBlocked(cached.status, cached.trial_ends_at)) {
        return NextResponse.redirect(
          new URL('/dashboard/settings?upgrade=true', request.url)
        )
      }
      // Cache hit and not blocked — continue
      return supabaseResponse
    }

    // 2️⃣ Cache miss — fetch from DB once, then write to cookie
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
      const blocked = isBlocked(profile.subscription_status, profile.trial_ends_at)

      if (blocked) {
        return NextResponse.redirect(
          new URL('/dashboard/settings?upgrade=true', request.url)
        )
      }

      // Write result to cookie so subsequent requests skip the DB
      const payload = encodeURIComponent(
        JSON.stringify({
          status: profile.subscription_status,
          trial_ends_at: profile.trial_ends_at,
        })
      )
      supabaseResponse.cookies.set(SUBSCRIPTION_COOKIE, payload, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}