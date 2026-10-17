import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDirections } from '@/lib/ors/directions'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { rateLimit } from '@/lib/rate-limit'
import { isDateOnly } from '@/lib/validation'

type ConfirmationBody = {
  date?: unknown
  startLocation?: unknown
  startLatitude?: unknown
  startLongitude?: unknown
  orderedJobIds?: unknown
  skippedJobIds?: unknown
}

function validCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 16_384) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }

  let body: ConfirmationBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request was invalid.' }, { status: 400 })
  }

  const { date, startLocation, startLatitude, startLongitude, orderedJobIds, skippedJobIds } = body
  if (
    !isDateOnly(date) ||
    typeof startLocation !== 'string' ||
    startLocation.trim().length === 0 ||
    startLocation.length > 300 ||
    !validCoordinate(startLatitude, -90, 90) ||
    !validCoordinate(startLongitude, -180, 180) ||
    !Array.isArray(orderedJobIds) ||
    orderedJobIds.length === 0 ||
    orderedJobIds.length > 200 ||
    orderedJobIds.some((id) => typeof id !== 'string' || id.length > 64) ||
    new Set(orderedJobIds).size !== orderedJobIds.length ||
    !Array.isArray(skippedJobIds) ||
    skippedJobIds.length > 200 ||
    skippedJobIds.some((id) => typeof id !== 'string' || id.length > 64) ||
    new Set(skippedJobIds).size !== skippedJobIds.length ||
    orderedJobIds.some((id) => skippedJobIds.includes(id))
  ) {
    return NextResponse.json({ error: 'The route proposal is invalid. Please optimize it again.' }, { status: 400 })
  }

  // A reviewed route is only safe to apply when every active job is included.
  // Skipped jobs may have failed geocoding or appointment feasibility checks;
  // accepting a partial route here would silently leave work off the day plan.
  if (skippedJobIds.length > 0) {
    return NextResponse.json(
      { error: 'Every scheduled job must be routable before this plan can be saved. Fix the unresolved stops and optimize again.' },
      { status: 409 }
    )
  }

  try {
    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in again.' }, { status: 401 })
    }
    const userId = userData.user.id

    const access = await getSubscriptionAccess(supabase, userId)
    if (access.status !== 'allowed') {
      return NextResponse.json(
        { error: access.status === 'unavailable'
          ? 'Account access could not be verified. Please try again.'
          : 'An active trial or subscription is required to save routes.' },
        { status: access.status === 'unavailable' ? 503 : 403 }
      )
    }

    const limit = await rateLimit(`confirm-route:${userId}`, { windowMs: 60_000, max: 20 })
    if (!limit.available) {
      return NextResponse.json({ error: 'Route service is temporarily unavailable.' }, { status: 503 })
    }
    if (!limit.success) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${limit.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, latitude, longitude')
      .eq('scheduled_date', date)
      .in('status', ['pending', 'in_progress'])
      .is('deleted_at', null)

    if (jobsError || !jobs) {
      return NextResponse.json({ error: 'Could not verify the current jobs. Please try again.' }, { status: 500 })
    }

    const expectedIds = new Set(jobs.map((job) => job.id))
    const proposalIds = new Set([...orderedJobIds, ...skippedJobIds] as string[])
    if (
      expectedIds.size !== proposalIds.size ||
      [...proposalIds].some((id) => !expectedIds.has(id))
    ) {
      return NextResponse.json(
        { error: 'Your jobs changed after this route was planned. Optimize again to review the latest stops.' },
        { status: 409 }
      )
    }

    const routableJobs = jobs.filter(
      (job) => typeof job.latitude === 'number' && typeof job.longitude === 'number'
    )
    const routableIds = new Set(routableJobs.map((job) => job.id))
    if (orderedJobIds.some((id) => !routableIds.has(id as string))) {
      return NextResponse.json(
        { error: 'The proposed route contains a stop without a usable location. Optimize again after fixing its address.' },
        { status: 409 }
      )
    }

    const jobsById = new Map(routableJobs.map((job) => [job.id, job]))
    const coordinates: [number, number][] = [
      [startLongitude, startLatitude],
      ...orderedJobIds.map((id) => {
        const job = jobsById.get(id as string)!
        return [job.longitude!, job.latitude!] as [number, number]
      }),
    ]
    const directions = await getDirections(coordinates)
    if (!directions) {
      return NextResponse.json(
        { error: 'Driving directions are unavailable, so the route was not saved. Please try again.' },
        { status: 503 }
      )
    }

    const { data: existing, error: existingError } = await supabase
      .from('routes')
      .select('id, status')
      .eq('scheduled_date', date)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: 'Could not verify the current route. Please try again.' }, { status: 500 })
    }
    if (existing?.status === 'in_progress' || existing?.status === 'completed') {
      return NextResponse.json(
        { error: 'This workday has already started or is complete. Its route can no longer be replaced.' },
        { status: 409 }
      )
    }

    const { data: savedRoute, error: upsertError } = await supabase
      .from('routes')
      .upsert(
        {
          user_id: userId,
          scheduled_date: date,
          status: 'optimized',
          total_distance_km: Math.round((directions.distanceMeters / 1000) * 10) / 10,
          total_duration_mins: Math.round(directions.durationSeconds / 60),
          start_location: startLocation.trim(),
          start_latitude: startLatitude,
          start_longitude: startLongitude,
          optimization_result: { orderedJobIds, geometry: directions.geometry },
          is_recalculated: !!existing,
          recalculated_at: existing ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id,scheduled_date' }
      )
      .select()
      .single()

    if (upsertError || !savedRoute) {
      console.error('Route confirmation upsert failed:', upsertError)
      return NextResponse.json({ error: 'Failed to save the reviewed route.' }, { status: 500 })
    }

    for (const [index, jobId] of orderedJobIds.entries()) {
      const { error } = await supabase.from('jobs').update({ order_index: index }).eq('id', jobId as string)
      if (error) {
        console.error('Route stop ordering update failed:', error)
        return NextResponse.json(
          { error: 'The route was saved, but stop order could not be fully updated. Please refresh and retry.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ route: savedRoute })
  } catch (error) {
    console.error('Route confirmation failed:', error)
    return NextResponse.json({ error: 'Could not save the route. Please try again.' }, { status: 500 })
  }
}
