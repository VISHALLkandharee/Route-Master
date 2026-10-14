import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { rateLimit } from '@/lib/rate-limit'
import { geocodeAddress } from '@/lib/ors/geocode'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const access = await getSubscriptionAccess(supabase)

  if (access.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (access.status === 'blocked') {
    return NextResponse.json({ error: 'An active trial or subscription is required.' }, { status: 402 })
  }
  if (access.status === 'unavailable') {
    return NextResponse.json({ error: 'Account access could not be verified.' }, { status: 503 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const clientIp = request.headers.get('x-real-ip') ?? forwardedFor?.split(',').at(-1)?.trim() ?? 'unknown'
  const ipHash = createHash('sha256').update(clientIp).digest('hex')
  const limit = await rateLimit(`geocode:${ipHash}`, { windowMs: 60_000, max: 30 })
  if (!limit.available) {
    return NextResponse.json({ error: 'Address service is temporarily unavailable.' }, { status: 503 })
  }
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many address lookups. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  try {
    const body: unknown = await request.json()
    const address =
      typeof body === 'object' && body !== null && 'address' in body
        ? (body as { address?: unknown }).address
        : null

    if (typeof address !== 'string' || !address.trim()) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 })
    }
    if (address.trim().length > 300) {
      return NextResponse.json({ error: 'Address must be 300 characters or fewer.' }, { status: 400 })
    }

    const result = await geocodeAddress(address.trim())

    if (!result) {
      return NextResponse.json({ latitude: null, longitude: null })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Geocode API route error:', error)
    return NextResponse.json({ error: 'Address lookup failed. Please try again.' }, { status: 502 })
  }
}
