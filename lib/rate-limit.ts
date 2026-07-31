interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

interface RateLimitOptions {
  windowMs: number  // time window in milliseconds
  max: number       // max requests per window
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(identifier)

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + options.windowMs })
    return { success: true, remaining: options.max - 1 }
  }

  if (entry.count >= options.max) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: options.max - entry.count }
}