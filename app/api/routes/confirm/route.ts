import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDirections } from '@/lib/ors/directions'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { rateLimit } from '@/lib/rate-limit'
import { isDateOnly } from '@/lib/validation'

type ConfirmationBody = {
  date?: unknown
  timezone?: unknown
  workdayStart?: unknown
  workdayEnd?: unknown
  appointmentSnapshot?: unknown
  startLocation?: unknown
  startLatitude?: unknown
  startLongitude?: unknown
  orderedJobIds?: unknown
  skippedJobIds?: unknown
}

type AppointmentSnapshot = {
  jobId: string
  latitude: number | null
  longitude: number | null
  scheduledTime: string
  latestStartTime: string | null
  estimatedDurationMinutes: number
}

function isTimeValue(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
}

function isAppointmentSnapshot(value: unknown): value is AppointmentSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const snapshot = value as Record<string, unknown>
  return typeof snapshot.jobId === 'string' && snapshot.jobId.length <= 64 &&
    (snapshot.latitude === null || validCoordinate(snapshot.latitude, -90, 90)) &&
    (snapshot.longitude === null || validCoordinate(snapshot.longitude, -180, 180)) &&
    isTimeValue(snapshot.scheduledTime) &&
    (snapshot.latestStartTime === null || isTimeValue(snapshot.latestStartTime)) &&
    typeof snapshot.estimatedDurationMinutes === 'number' &&
    Number.isInteger(snapshot.estimatedDurationMinutes) && snapshot.estimatedDurationMinutes >= 15
}

function comparableTime(value: string | null) {
  return value?.slice(0, 5) ?? null
}

function validCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  if (!request.body) return { ok: false as const, tooLarge: false }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return { ok: false as const, tooLarge: true }
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { ok: true as const, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown }
  } catch {
    return { ok: false as const, tooLarge: false }
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: NextRequest) {
  const maxBodyBytes = 65_536
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }

  const parsedBody = await readBoundedJson(request, maxBodyBytes)
  if (parsedBody.tooLarge) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }
  if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null) {
    return NextResponse.json({ error: 'Request was invalid.' }, { status: 400 })
  }
  const body = parsedBody.value as ConfirmationBody

  const {
    date,
    timezone,
    workdayStart,
    workdayEnd,
    appointmentSnapshot,
    startLocation,
    startLatitude,
    startLongitude,
    orderedJobIds,
    skippedJobIds,
  } = body
  if (
    !isDateOnly(date) ||
    typeof timezone !== 'string' || timezone.length > 100 ||
    !isTimeValue(workdayStart) || !isTimeValue(workdayEnd) || workdayEnd <= workdayStart ||
    !Array.isArray(appointmentSnapshot) || appointmentSnapshot.length > 50 ||
    !appointmentSnapshot.every(isAppointmentSnapshot) ||
    new Set(appointmentSnapshot.map((job) => (job as AppointmentSnapshot).jobId)).size !== appointmentSnapshot.length ||
    typeof startLocation !== 'string' ||
    startLocation.trim().length === 0 ||
    startLocation.length > 300 ||
    !validCoordinate(startLatitude, -90, 90) ||
    !validCoordinate(startLongitude, -180, 180) ||
    !Array.isArray(orderedJobIds) ||
    orderedJobIds.length === 0 ||
    orderedJobIds.length > 50 ||
    orderedJobIds.some((id) => typeof id !== 'string' || id.length > 64) ||
    new Set(orderedJobIds).size !== orderedJobIds.length ||
    !Array.isArray(skippedJobIds) ||
    skippedJobIds.length > 50 ||
    skippedJobIds.some((id) => typeof id !== 'string' || id.length > 64) ||
    new Set(skippedJobIds).size !== skippedJobIds.length ||
    orderedJobIds.some((id) => skippedJobIds.includes(id))
  ) {
    return NextResponse.json({ error: 'The route proposal is invalid. Please optimize it again.' }, { status: 400 })
  }

  // Partial plans are allowed only when the proposal explicitly accounts for
  // every active job as either routed or skipped. The dashboard keeps skipped
  // jobs visible so applying a feasible subset can never silently drop work.

  try {
    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in again.' }, { status: 401 })
    }
    const userId = userData.user.id

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('timezone, workday_start, workday_end')
      .eq('id', userId)
      .maybeSingle()
    if (profileError || !profile) {
      return NextResponse.json({ error: 'Could not verify your workday settings. Please try again.' }, { status: 503 })
    }
    if (
      profile.timezone !== timezone ||
      comparableTime(profile.workday_start) !== comparableTime(workdayStart as string) ||
      comparableTime(profile.workday_end) !== comparableTime(workdayEnd as string)
    ) {
      return NextResponse.json(
        { error: 'Your timezone or workday hours changed after this route was planned. Optimize again to review the latest schedule.' },
        { status: 409 }
      )
    }

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
      .select('id, latitude, longitude, scheduled_time, latest_start_time, estimated_duration')
      .eq('scheduled_date', date)
      .in('status', ['pending', 'in_progress'])
      .is('deleted_at', null)

    if (jobsError || !jobs) {
      return NextResponse.json({ error: 'Could not verify the current jobs. Please try again.' }, { status: 500 })
    }

    const expectedIds = new Set(jobs.map((job) => job.id))
    const proposalIds = new Set([...orderedJobIds, ...skippedJobIds] as string[])
    const snapshotById = new Map(
      (appointmentSnapshot as AppointmentSnapshot[]).map((job) => [job.jobId, job])
    )
    if (
      expectedIds.size !== proposalIds.size ||
      [...proposalIds].some((id) => !expectedIds.has(id)) ||
      snapshotById.size !== expectedIds.size ||
      jobs.some((job) => {
        const planned = snapshotById.get(job.id)
        return !planned ||
          comparableTime(job.scheduled_time) !== comparableTime(planned.scheduledTime) ||
          comparableTime(job.latest_start_time) !== comparableTime(planned.latestStartTime) ||
          job.latitude !== planned.latitude ||
          job.longitude !== planned.longitude ||
          job.estimated_duration !== planned.estimatedDurationMinutes
      })
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

    const { data: savedRoute, error: saveError } = await supabase.rpc('confirm_route_with_stops', {
      p_scheduled_date: date,
      p_timezone: timezone as string,
      p_workday_start: workdayStart as string,
      p_workday_end: workdayEnd as string,
      p_appointment_snapshot: appointmentSnapshot,
      p_ordered_job_ids: orderedJobIds,
      p_total_distance_km: Math.round((directions.distanceMeters / 1000) * 10) / 10,
      p_total_duration_mins: Math.round(directions.durationSeconds / 60),
      p_start_location: startLocation.trim(),
      p_start_latitude: startLatitude,
      p_start_longitude: startLongitude,
      p_optimization_result: { orderedJobIds, geometry: directions.geometry },
    })

    if (saveError || !savedRoute) {
      if (saveError?.code === '55000') {
        return NextResponse.json(
          { error: 'This workday has already started or is complete. Its route can no longer be replaced.' },
          { status: 409 }
        )
      }
      if (saveError?.code === '40001') {
        return NextResponse.json(
          { error: 'Your jobs or workday settings changed while saving. Optimize again to review the latest plan.' },
          { status: 409 }
        )
      }
      if (saveError?.code === '22023') {
        return NextResponse.json({ error: 'The route proposal is invalid. Please optimize it again.' }, { status: 400 })
      }
      console.error('Atomic route confirmation failed:', saveError)
      return NextResponse.json({ error: 'Failed to save the reviewed route.' }, { status: 500 })
    }

    return NextResponse.json({ route: savedRoute })
  } catch (error) {
    console.error('Route confirmation failed:', error)
    return NextResponse.json({ error: 'Could not save the route. Please try again.' }, { status: 500 })
  }
}
