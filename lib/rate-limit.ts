import { createClient as createSupabaseClient } from '@supabase/supabase-js'

interface RateLimitOptions {
  windowMs: number
  max: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  retryAfterSeconds: number
  available: boolean
}

// This fallback is intentionally limited to local development and tests.
const localStore = new Map<string, { count: number; resetAt: number }>()

function localRateLimit(identifier: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = localStore.get(identifier)

  if (!entry || now >= entry.resetAt) {
    localStore.set(identifier, { count: 1, resetAt: now + options.windowMs })
    return {
      success: true,
      remaining: options.max - 1,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
      available: true,
    }
  }

  if (entry.count >= options.max) {
    return {
      success: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      available: true,
    }
  }

  entry.count += 1
  return {
    success: true,
    remaining: options.max - entry.count,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    available: true,
  }
}

export async function rateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV !== 'production') {
    return localRateLimit(identifier, options)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      success: false,
      remaining: 0,
      retryAfterSeconds: 60,
      available: false,
    }
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    const { data, error } = await admin.rpc('consume_api_rate_limit', {
      p_key: identifier,
      p_max_requests: options.max,
      p_window_seconds: Math.ceil(options.windowMs / 1000),
    })

    if (error || !data?.[0]) {
      console.error('Distributed rate limit unavailable:', error?.message)
      return {
        success: false,
        remaining: 0,
        retryAfterSeconds: 60,
        available: false,
      }
    }

    const result = data[0] as {
      success: boolean
      remaining: number
      retry_after_seconds: number
    }

    return {
      success: result.success,
      remaining: result.remaining,
      retryAfterSeconds: result.retry_after_seconds,
      available: true,
    }
  } catch (error) {
    console.error('Distributed rate limit request failed:', error)
    return {
      success: false,
      remaining: 0,
      retryAfterSeconds: 60,
      available: false,
    }
  }
}
