import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDirections } from '@/lib/ors/directions'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { rateLimit } from '@/lib/rate-limit'
import { isDateOnly } from '@/lib/validation'

type PendingSnapshot = {
  jobId: string
  latitude: number | null
  longitude: number | null
  scheduledTime: string
  latestStartTime: string | null
  estimatedDurationMinutes: number
}

function validCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isSnapshot(value: unknown): value is PendingSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return isUuid(item.jobId) &&
    (item.latitude === null || validCoordinate(item.latitude, -90, 90)) &&
    (item.longitude === null || validCoordinate(item.longitude, -180, 180)) &&
    isTime(item.scheduledTime) && (item.latestStartTime === null || isTime(item.latestStartTime)) &&
    typeof item.estimatedDurationMinutes === 'number' && Number.isInteger(item.estimatedDurationMinutes) && item.estimatedDurationMinutes >= 15
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: NextRequest) {
  const body = await readBoundedJson(request, 65_536)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request is invalid or too large.' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const {
    date, timezone, workdayStart, workdayEnd, appointmentSnapshot,
    expectedOrderedJobIds, currentStopJobId, startLocation, startLatitude,
    startLongitude, orderedJobIds, skippedJobIds, appointmentConflictJobIds,
  } = input
  const conflicts = appointmentConflictJobIds ?? []
  const validIds = (value: unknown, min: number, max: number): value is string[] =>
    Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every(isUuid) && new Set(value).size === value.length

  if (!isDateOnly(date) || typeof timezone !== 'string' || timezone.length > 100 ||
      !isTime(workdayStart) || !isTime(workdayEnd) || workdayEnd <= workdayStart ||
      !Array.isArray(appointmentSnapshot) || appointmentSnapshot.length > 50 || !appointmentSnapshot.every(isSnapshot) ||
      !validIds(expectedOrderedJobIds, 1, 100) ||
      !(currentStopJobId === null || isUuid(currentStopJobId)) ||
      typeof startLocation !== 'string' || !startLocation.trim() || startLocation.length > 300 ||
      !validCoordinate(startLatitude, -90, 90) || !validCoordinate(startLongitude, -180, 180) ||
      !validIds(orderedJobIds, 1, 50) || !validIds(skippedJobIds, 0, 50) ||
      !Array.isArray(conflicts) || conflicts.length > 50 || conflicts.some((id) => !isUuid(id)) ||
      new Set(conflicts).size !== conflicts.length ||
      orderedJobIds.some((id: string) => skippedJobIds.includes(id)) ||
      new Set(appointmentSnapshot.map((job: PendingSnapshot) => job.jobId)).size !== appointmentSnapshot.length) {
    return NextResponse.json({ error: 'The remaining route proposal is invalid. Replan it and try again.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) return NextResponse.json({ error: 'Unauthorized. Please log in again.' }, { status: 401 })
    const userId = auth.user.id

    const { data: profile, error: profileError } = await supabase
      .from('users').select('timezone, workday_start, workday_end').eq('id', userId).maybeSingle()
    if (profileError || !profile) return NextResponse.json({ error: 'Could not verify workday settings.' }, { status: 503 })
    const time = (value: string | null) => value?.slice(0, 5) ?? null
    if (profile.timezone !== timezone || time(profile.workday_start) !== time(workdayStart as string) || time(profile.workday_end) !== time(workdayEnd as string)) {
      return NextResponse.json({ error: 'Workday settings changed. Replan the remaining stops.' }, { status: 409 })
    }
    const access = await getSubscriptionAccess(supabase, userId)
    if (access.status !== 'allowed') return NextResponse.json({ error: access.status === 'unavailable' ? 'Account access could not be verified.' : 'An active trial or subscription is required to save routes.' }, { status: access.status === 'unavailable' ? 503 : 403 })
    const limit = await rateLimit(`replan-route:${userId}`, { windowMs: 60_000, max: 20 })
    if (!limit.available) return NextResponse.json({ error: 'Route service is temporarily unavailable.' }, { status: 503 })
    if (!limit.success) return NextResponse.json({ error: `Too many requests. Wait ${limit.retryAfterSeconds} seconds.` }, { status: 429 })

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs').select('id, status, latitude, longitude, scheduled_time, latest_start_time, estimated_duration')
      .eq('scheduled_date', date).in('status', ['pending', 'in_progress']).is('deleted_at', null)
    if (jobsError || !jobs) return NextResponse.json({ error: 'Could not verify the remaining jobs.' }, { status: 503 })
    const pending = jobs.filter((job) => job.status === 'pending')
    const snapshots = appointmentSnapshot as PendingSnapshot[]
    const byId = new Map(snapshots.map((job) => [job.jobId, job]))
    if (pending.length !== snapshots.length || pending.some((job) => {
      const planned = byId.get(job.id)
      return !planned || time(job.scheduled_time) !== time(planned.scheduledTime) ||
        time(job.latest_start_time) !== time(planned.latestStartTime) ||
        job.latitude !== planned.latitude || job.longitude !== planned.longitude ||
        job.estimated_duration !== planned.estimatedDurationMinutes
    }) || [...orderedJobIds as string[], ...skippedJobIds as string[]].length !== pending.length ||
      new Set([...orderedJobIds as string[], ...skippedJobIds as string[]]).size !== pending.length ||
      [...orderedJobIds as string[], ...skippedJobIds as string[]].some((id) => !byId.has(id)) ||
      (conflicts as string[]).some((id) => !(orderedJobIds as string[]).includes(id))) {
      return NextResponse.json({ error: 'Jobs or the active visit changed after the preview. Replan to review the latest stops.' }, { status: 409 })
    }

    const jobById = new Map(pending.map((job) => [job.id, job]))
    if ((orderedJobIds as string[]).some((id) => {
      const job = jobById.get(id)
      return !job || job.latitude === null || job.longitude === null
    })) return NextResponse.json({ error: 'A proposed stop no longer has a usable location. Replan after correcting the address.' }, { status: 409 })

    const directions = await getDirections([
      [startLongitude as number, startLatitude as number],
      ...(orderedJobIds as string[]).map((id) => {
        const job = jobById.get(id)!
        return [job.longitude!, job.latitude!] as [number, number]
      }),
    ])
    if (!directions) return NextResponse.json({ error: 'Driving directions are unavailable; no changes were saved.' }, { status: 503 })

    const { data: route, error: saveError } = await supabase.rpc('replan_remaining_route', {
      p_scheduled_date: date,
      p_timezone: timezone,
      p_workday_start: workdayStart,
      p_workday_end: workdayEnd,
      p_pending_snapshot: appointmentSnapshot,
      p_expected_ordered_job_ids: expectedOrderedJobIds,
      p_current_stop_job_id: currentStopJobId,
      p_replanned_job_ids: orderedJobIds,
      p_total_distance_km: Math.round((directions.distanceMeters / 1000) * 10) / 10,
      p_total_duration_mins: Math.round(directions.durationSeconds / 60),
      p_start_location: (startLocation as string).trim(),
      p_start_latitude: startLatitude,
      p_start_longitude: startLongitude,
      p_appointment_conflict_job_ids: conflicts,
      p_geometry: directions.geometry,
    })
    if (saveError || !route) {
      if (saveError?.code === '55000') return NextResponse.json({ error: 'This workday is no longer active. Refresh to see its current status.' }, { status: 409 })
      if (saveError?.code === '40001') return NextResponse.json({ error: 'The route or jobs changed while saving. Replan to review the latest work.' }, { status: 409 })
      if (saveError?.code === '22023') return NextResponse.json({ error: 'The replan proposal is invalid. Please replan and try again.' }, { status: 400 })
      console.error('Atomic remaining route update failed:', saveError)
      return NextResponse.json({ error: 'Could not save the remaining route.' }, { status: 500 })
    }
    return NextResponse.json({ route })
  } catch (error) {
    console.error('Remaining route replan failed:', error)
    return NextResponse.json({ error: 'Could not save the remaining route. Please try again.' }, { status: 500 })
  }
}
