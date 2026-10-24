import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/ors/geocode'
import { optimizeRoute } from '@/lib/ors/optimize'
import { getDirections } from '@/lib/ors/directions'
import { rateLimit } from '@/lib/rate-limit'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { isDateOnly } from '@/lib/validation'
import { zonedTimeToUnixSeconds } from '@/lib/time/zoned-time'


interface JobRow {
  id: string
  status: 'pending' | 'in_progress'
  client_id: string
  address: string
  latitude: number | null
  longitude: number | null
  scheduled_time: string
  latest_start_time: string | null
  estimated_duration: number
  order_index: number
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
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const supabase = await createClient()

        const maxBodyBytes = 8192
        const contentLengthHeader = request.headers.get('content-length')
        const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
        if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxBodyBytes)) {
          send({ step: 'error', message: 'Request is too large.' })
          controller.close()
          return
        }

        // ── Auth ────────────────────────────────────────────────
        const { data: userData, error: userError } =
          await supabase.auth.getUser()
        if (userError || !userData.user) {
          send({ step: 'error', message: 'Unauthorized. Please log in again.' })
          controller.close()
          return
        }
        const userId = userData.user.id

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('timezone, workday_start, workday_end')
          .eq('id', userId)
          .maybeSingle()
        if (profileError || !profile?.timezone || !profile.workday_start || !profile.workday_end) {
          send({ step: 'error', message: 'Your timezone or workday hours are unavailable. Update them in Settings, then try again.' })
          controller.close()
          return
        }

        const access = await getSubscriptionAccess(supabase, userId)
        if (access.status !== 'allowed') {
          send({
            step: 'error',
            message:
              access.status === 'unavailable'
                ? 'Account access could not be verified. Please try again.'
                : 'An active trial or subscription is required to optimize routes.',
          })
          controller.close()
          return
        }

        const limit = await rateLimit(`optimize:${userId}`, {
          windowMs: 60 * 1000,
          max: 10,
        })

        if (!limit.available) {
          send({ step: 'error', message: 'Route service is temporarily unavailable. Please try again.' })
          controller.close()
          return
        }
        if (!limit.success) {
          send({
            step: 'error',
            message: `Too many requests. Please wait ${limit.retryAfterSeconds} seconds before trying again.`,
          })
          controller.close()
          return
        }

        const parsedBody = await readBoundedJson(request, maxBodyBytes)
        if (parsedBody.tooLarge) {
          send({ step: 'error', message: 'Request is too large.' })
          controller.close()
          return
        }
        if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null || Array.isArray(parsedBody.value)) {
          send({ step: 'error', message: 'Request was invalid. Please refresh and try again.' })
          controller.close()
          return
        }
        const body = parsedBody.value
        const date =
          typeof body === 'object' && body !== null && 'date' in body
            ? (body as { date?: unknown }).date
            : null
        const start_location =
          typeof body === 'object' && body !== null && 'start_location' in body
            ? (body as { start_location?: unknown }).start_location
            : null
        const rawStartCoordinates =
          typeof body === 'object' && body !== null && 'start_coordinates' in body
            ? (body as { start_coordinates?: unknown }).start_coordinates
            : null
        const mode = typeof body === 'object' && body !== null && 'mode' in body
          ? (body as { mode?: unknown }).mode
          : 'day'

        if (!isDateOnly(date)) {
          send({ step: 'error', message: 'A date is required.' })
          controller.close()
          return
        }
        if (mode !== 'day' && mode !== 'remaining') {
          send({ step: 'error', message: 'Route planning mode is invalid. Refresh the page and try again.' })
          controller.close()
          return
        }
        if (start_location !== null && (typeof start_location !== 'string' || start_location.length > 300)) {
          send({ step: 'error', message: 'Start location is invalid. Please check it and try again.' })
          controller.close()
          return
        }

        const { data: savedDay, error: savedDayError } = await supabase
          .from('routes')
          .select('id, status, start_location, start_latitude, start_longitude, optimization_result')
          .eq('scheduled_date', date)
          .maybeSingle()
        if (savedDayError) {
          send({ step: 'error', message: 'Could not verify whether this workday is editable. Please try again.' })
          controller.close()
          return
        }
        if (mode === 'day' && savedDay?.status === 'in_progress') {
          send({
            step: 'error',
            message: 'This workday has started, so its saved route is locked while you work.',
          })
          controller.close()
          return
        }
        if (mode === 'remaining' && savedDay?.status !== 'in_progress') {
          send({ step: 'error', message: 'Replanning is available only while this workday is in progress. Refresh the page and try again.' })
          controller.close()
          return
        }
        if (mode === 'remaining' && (typeof start_location !== 'string' || !start_location.trim())) {
          send({ step: 'error', message: 'Enter or detect your current location to replan the remaining stops.' })
          controller.close()
          return
        }

        let requestedStartCoordinates: { latitude: number; longitude: number } | null = null
        if (rawStartCoordinates !== null && rawStartCoordinates !== undefined) {
          if (
            typeof rawStartCoordinates !== 'object' ||
            !('latitude' in rawStartCoordinates) ||
            !('longitude' in rawStartCoordinates) ||
            typeof rawStartCoordinates.latitude !== 'number' ||
            typeof rawStartCoordinates.longitude !== 'number' ||
            !Number.isFinite(rawStartCoordinates.latitude) ||
            !Number.isFinite(rawStartCoordinates.longitude) ||
            rawStartCoordinates.latitude < -90 ||
            rawStartCoordinates.latitude > 90 ||
            rawStartCoordinates.longitude < -180 ||
            rawStartCoordinates.longitude > 180
          ) {
            send({ step: 'error', message: 'Start coordinates are invalid. Please detect your location again.' })
            controller.close()
            return
          }
          requestedStartCoordinates = {
            latitude: rawStartCoordinates.latitude,
            longitude: rawStartCoordinates.longitude,
          }
        }

        // ── Step 1: Geocode start location ───────────────────────
        send({
          step: 'geocoding',
          message: requestedStartCoordinates
            ? 'Using your detected start location...'
            : 'Locating your start address...',
        })

        let startLatitude: number | null = null
        let startLongitude: number | null = null
        let startLocationText: string | null = null

        if (requestedStartCoordinates) {
          startLatitude = requestedStartCoordinates.latitude
          startLongitude = requestedStartCoordinates.longitude
          startLocationText =
            typeof start_location === 'string' && start_location.trim()
              ? start_location.trim()
              : `Current location (${startLatitude.toFixed(5)}, ${startLongitude.toFixed(5)})`
        } else if (typeof start_location === 'string' && start_location.trim()) {
          const geocoded = await geocodeAddress(start_location.trim())
          if (!geocoded) {
            send({
              step: 'error',
              message:
                'Could not locate that start address. Use the location pin or enter a more specific address.',
            })
            controller.close()
            return
          }
          startLatitude = geocoded.latitude
          startLongitude = geocoded.longitude
          startLocationText = start_location.trim()
        } else {
          const { data: existingRoute } = await supabase
            .from('routes')
            .select('start_location, start_latitude, start_longitude')
            .eq('scheduled_date', date)
            .maybeSingle()

          if (!existingRoute?.start_latitude) {
            send({
              step: 'error',
              message: 'Please set a start location before optimizing.',
            })
            controller.close()
            return
          }
          startLatitude = existingRoute.start_latitude
          startLongitude = existingRoute.start_longitude
          startLocationText = existingRoute.start_location
        }

        // ── Step 2: Load jobs ────────────────────────────────────
        send({ step: 'loading_jobs', message: 'Loading your jobs for the day...' })

        const { data: jobs, error: jobsError } = await supabase
          .from('jobs')
          .select('id, status, client_id, address, latitude, longitude, scheduled_time, latest_start_time, estimated_duration, order_index')
          .eq('scheduled_date', date)
          .in('status', ['pending', 'in_progress'])
          .is('deleted_at', null)

        if (jobsError) {
          send({ step: 'error', message: 'Failed to load jobs for this day.' })
          controller.close()
          return
        }

        if (!jobs || jobs.length === 0) {
          send({ step: 'error', message: 'No jobs scheduled for this day.' })
          controller.close()
          return
        }
        if (jobs.length > 50) {
          send({ step: 'error', message: 'The routing service supports up to 50 stops per route. Split this work across multiple days, then optimize again.' })
          controller.close()
          return
        }

        const savedOrderedIds: string[] = Array.isArray(savedDay?.optimization_result?.orderedJobIds)
          ? savedDay.optimization_result.orderedJobIds.filter((id: unknown): id is string => typeof id === 'string')
          : []
        const currentStops = (jobs as JobRow[]).filter((job) => job.status === 'in_progress')
        if (mode === 'remaining' && (currentStops.length > 1 || (currentStops.length === 1 && !savedOrderedIds.includes(currentStops[0].id)))) {
          send({ step: 'error', message: 'The active visit could not be matched to this saved route. Complete or correct the active visit in Jobs before replanning.' })
          controller.close()
          return
        }
        const currentStopJobId = mode === 'remaining' ? currentStops[0]?.id ?? null : null
        const jobsToOptimize = mode === 'remaining'
          ? (jobs as JobRow[]).filter((job) => job.status === 'pending')
          : jobs as JobRow[]
        if (jobsToOptimize.length === 0) {
          send({ step: 'error', message: 'There are no pending stops left to replan. Finish the active visit or add another job first.' })
          controller.close()
          return
        }

        if (savedDay?.status === 'completed') {
          const completedRouteIds = Array.isArray(savedDay.optimization_result?.orderedJobIds)
            ? savedDay.optimization_result.orderedJobIds.filter((id: unknown): id is string => typeof id === 'string')
            : []
          if (jobs.some((job) => completedRouteIds.includes(job.id))) {
            send({
              step: 'error',
              message: 'This completed route still has an active stop. Reopen that visit from Jobs before planning another route.',
            })
            controller.close()
            return
          }
        }

        const vehicleStart = zonedTimeToUnixSeconds(date, profile.workday_start, profile.timezone)
        const vehicleEnd = zonedTimeToUnixSeconds(date, profile.workday_end, profile.timezone)
        if (vehicleStart === null || vehicleEnd === null) {
          send({ step: 'error', message: 'Could not interpret this workday in your account timezone. Check Settings and try again.' })
          controller.close()
          return
        }

        if (profile.workday_end <= profile.workday_start) {
          send({ step: 'error', message: 'Your workday end must be later than its start. Update your hours in Settings.' })
          controller.close()
          return
        }

        const appointmentWindows = new Map<string, [number, number]>()
        for (const job of jobsToOptimize) {
          const earliestStart = zonedTimeToUnixSeconds(date, job.scheduled_time, profile.timezone)
          const latestStart = zonedTimeToUnixSeconds(
            date,
            job.latest_start_time ?? job.scheduled_time,
            profile.timezone,
          )
          if (earliestStart === null || latestStart === null || latestStart < earliestStart) {
            send({ step: 'error', message: 'A job has an invalid or unavailable appointment time. Correct its schedule, then optimize again.' })
            controller.close()
            return
          }
          appointmentWindows.set(job.id, [earliestStart, latestStart])
        }

        // ── Step 3: Backfill missing coordinates ─────────────────
        send({
          step: 'backfill',
          message: `Finding coordinates for ${jobsToOptimize.length} job${jobsToOptimize.length > 1 ? 's' : ''}...`,
        })

        const skippedJobIds: string[] = []
        const routableJobs: {
          id: string
          latitude: number
          longitude: number
          scheduledTime: string
          estimatedDurationMinutes: number
          orderIndex: number
          timeWindow: [number, number]
          latestStartTime: string | null
        }[] = []

        for (const job of jobs as JobRow[]) {
          if (typeof job.latitude === 'number' && typeof job.longitude === 'number') {
            routableJobs.push({
              id: job.id,
              latitude: job.latitude,
              longitude: job.longitude,
              scheduledTime: job.scheduled_time,
              estimatedDurationMinutes: job.estimated_duration,
              orderIndex: job.order_index,
              timeWindow: appointmentWindows.get(job.id)!,
              latestStartTime: job.latest_start_time,
            })
            continue
          }

          const geocoded = await geocodeAddress(job.address)
          if (!geocoded) {
            skippedJobIds.push(job.id)
            continue
          }

          await supabase
            .from('jobs')
            .update({
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
            })
            .eq('id', job.id)

          await supabase
            .from('clients')
            .update({
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
            })
            .eq('id', job.client_id)
            .is('latitude', null)

          routableJobs.push({
            id: job.id,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            scheduledTime: job.scheduled_time,
            estimatedDurationMinutes: job.estimated_duration,
            orderIndex: job.order_index,
            timeWindow: appointmentWindows.get(job.id)!,
            latestStartTime: job.latest_start_time,
          })
        }

        if (routableJobs.length === 0) {
          send({
            step: 'error',
            message: 'None of the job addresses could be located.',
          })
          controller.close()
          return
        }

        // ── Step 4: Optimize order ───────────────────────────────
        send({
          step: 'optimizing',
          message: `Calculating the best order for ${routableJobs.length} stops...`,
        })

        const constrainedResult = await optimizeRoute(
          { latitude: startLatitude!, longitude: startLongitude! },
          routableJobs.map((job) => ({
            id: job.id,
            latitude: job.latitude,
            longitude: job.longitude,
            estimatedDurationMinutes: job.estimatedDurationMinutes,
            timeWindow: job.timeWindow,
          })),
          [vehicleStart, vehicleEnd]
        )

        if (!constrainedResult) {
          send({
            step: 'error',
            message:
              'Route optimization service is unavailable right now. Please try again shortly.',
          })
          controller.close()
          return
        }

        const nowSeconds = Math.floor(Date.now() / 1000)
        const overdueJobIds = jobsToOptimize
          .filter((job) => appointmentWindows.get(job.id)![1] < nowSeconds)
          .map((job) => job.id)
        // A timing conflict is actionable when it affects the sequence of a
        // multi-stop day. A single stop has no ordering decision to warn about;
        // it should still be routed even when its appointment window is past.
        const timingConflictCandidates = new Set(
          routableJobs.length > 1
            ? [...constrainedResult.unassignedJobIds, ...overdueJobIds]
            : [],
        )
        const needsRoadFirstFallback =
          constrainedResult.unassignedJobIds.length > 0 || overdueJobIds.length > 0

        // Appointment/work-hour windows are useful guidance, but must not
        // make a real, routable job disappear. If any stop is overdue or the
        // constrained plan would omit work, ask VROOM for the best road order
        // without time windows and report the conflicts for user review.
        const optimizeResult = needsRoadFirstFallback
          ? await optimizeRoute(
              { latitude: startLatitude!, longitude: startLongitude! },
              routableJobs.map((job) => ({
                id: job.id,
                latitude: job.latitude,
                longitude: job.longitude,
                estimatedDurationMinutes: job.estimatedDurationMinutes,
              }))
            )
          : constrainedResult

        if (!optimizeResult) {
          send({ step: 'error', message: 'The road-routing service is unavailable right now. Please try again shortly.' })
          controller.close()
          return
        }

        if (optimizeResult.orderedJobIds.length === 0) {
          send({
            step: 'error',
            message: 'The road-routing service could not build a route to these stops. Check the addresses and try again.',
          })
          controller.close()
          return
        }

        const appointmentConflictJobIds = [...timingConflictCandidates]
          .filter((jobId) => optimizeResult.orderedJobIds.includes(jobId))

        const skippedWithNoRoute = [
          ...new Set([...skippedJobIds, ...optimizeResult.unassignedJobIds]),
        ]

        // ── Step 5: Driving directions ───────────────────────────
        send({
          step: 'directions',
          message: 'Getting turn-by-turn driving directions...',
        })

        const orderedCoords: [number, number][] = [
          [startLongitude!, startLatitude!],
        ]
        for (const jobId of optimizeResult.orderedJobIds) {
          const job = routableJobs.find((j) => j.id === jobId)
          if (job) orderedCoords.push([job.longitude, job.latitude])
        }

        const directions = await getDirections(orderedCoords)

        const { data: currentRoute } = await supabase
          .from('routes')
          .select('optimization_result')
          .eq('scheduled_date', date)
          .maybeSingle()
        const routableById = new Map(routableJobs.map((job) => [job.id, job]))
        const priorOrderedIds: string[] = Array.isArray(currentRoute?.optimization_result?.orderedJobIds)
          ? currentRoute.optimization_result.orderedJobIds.filter(
              (id: unknown): id is string => typeof id === 'string' && routableById.has(id)
            )
          : []
        const selectedJobIds = new Set<string>(optimizeResult.orderedJobIds)
        const baselineIds = [
          ...priorOrderedIds.filter((id) => selectedJobIds.has(id)),
          ...[...routableJobs]
            .filter((job) => selectedJobIds.has(job.id))
            .sort((a, b) => a.orderIndex - b.orderIndex || a.scheduledTime.localeCompare(b.scheduledTime))
            .map((job) => job.id)
            .filter((id) => !priorOrderedIds.includes(id)),
        ]
        const baselineDirections = await getDirections([
          [startLongitude!, startLatitude!],
          ...baselineIds.flatMap((jobId) => {
            const job = routableById.get(jobId)
            return job ? [[job.longitude, job.latitude] as [number, number]] : []
          }),
        ])

        // Optimization is a proposal only. Saving is deferred until the user
        // reviews and confirms the stop order in the dashboard.
        send({
          step: 'preview',
          proposal: {
            date,
            timezone: profile.timezone,
            workdayStart: profile.workday_start,
            workdayEnd: profile.workday_end,
            startLocation: startLocationText,
            startLatitude,
            startLongitude,
            orderedJobIds: optimizeResult.orderedJobIds,
            appointmentConflictJobIds,
            skippedJobIds: skippedWithNoRoute,
            unlocatedJobIds: skippedJobIds,
            infeasibleJobIds: optimizeResult.unassignedJobIds,
            mode,
            currentStopJobId,
            expectedOrderedJobIds: mode === 'remaining' ? savedOrderedIds : undefined,
            totalJobCount: jobsToOptimize.length,
            appointmentSnapshot: jobsToOptimize.map((job) => {
              const routableJob = routableById.get(job.id)
              return {
                jobId: job.id,
                latitude: routableJob?.latitude ?? null,
                longitude: routableJob?.longitude ?? null,
                scheduledTime: job.scheduled_time,
                latestStartTime: job.latest_start_time,
                estimatedDurationMinutes: job.estimated_duration,
              }
            }),
            distanceMeters: directions?.distanceMeters ?? optimizeResult.distanceMeters,
            driveDurationSeconds: directions?.durationSeconds ?? optimizeResult.durationSeconds,
            currentDistanceMeters: baselineDirections?.distanceMeters ?? null,
            currentDriveDurationSeconds: baselineDirections?.durationSeconds ?? null,
            serviceDurationMinutes: optimizeResult.orderedJobIds.reduce((total, jobId) => {
              const job = routableById.get(jobId)
              return total + (job?.estimatedDurationMinutes ?? 0)
            }, 0),
            geometry: directions?.geometry ?? [],
            stops: optimizeResult.stops.map((stop) => {
              const job = routableJobs.find((candidate) => candidate.id === stop.jobId)
              return {
                jobId: stop.jobId,
                scheduledTime: job?.scheduledTime,
                latestStartTime: job?.latestStartTime,
                estimatedDurationMinutes: job?.estimatedDurationMinutes,
              }
            }),
          },
        })
        controller.close()
      } catch (error) {
        console.error('Optimize stream error:', error)
        send({
          step: 'error',
          message: 'Something went wrong. Please try again.',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
