import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/ors/geocode'
import { optimizeRoute } from '@/lib/ors/optimize'
import { getDirections } from '@/lib/ors/directions'
import { rateLimit } from '@/lib/rate-limit'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { isDateOnly } from '@/lib/validation'


interface JobRow {
  id: string
  client_id: string
  address: string
  latitude: number | null
  longitude: number | null
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

        const contentLength = Number(request.headers.get('content-length') ?? 0)
        if (contentLength > 8192) {
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

        let body: unknown
        try {
          body = await request.json()
        } catch {
          send({ step: 'error', message: 'Request was invalid. Please refresh and try again.' })
          controller.close()
          return
        }
        const date =
          typeof body === 'object' && body !== null && 'date' in body
            ? (body as { date?: unknown }).date
            : null
        const start_location =
          typeof body === 'object' && body !== null && 'start_location' in body
            ? (body as { start_location?: unknown }).start_location
            : null

        if (!isDateOnly(date)) {
          send({ step: 'error', message: 'A date is required.' })
          controller.close()
          return
        }
        if (start_location !== null && (typeof start_location !== 'string' || start_location.length > 300)) {
          send({ step: 'error', message: 'Start location is invalid. Please check it and try again.' })
          controller.close()
          return
        }

        // ── Step 1: Geocode start location ───────────────────────
        send({ step: 'geocoding', message: 'Locating your start address...' })

        let startLatitude: number | null = null
        let startLongitude: number | null = null
        let startLocationText: string | null = null

        if (typeof start_location === 'string' && start_location.trim()) {
          const geocoded = await geocodeAddress(start_location.trim())
          if (!geocoded) {
            send({
              step: 'error',
              message:
                'Could not locate that start address. Please check it and try again.',
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
          .select('id, client_id, address, latitude, longitude')
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

        // ── Step 3: Backfill missing coordinates ─────────────────
        send({
          step: 'backfill',
          message: `Finding coordinates for ${jobs.length} job${jobs.length > 1 ? 's' : ''}...`,
        })

        const skippedJobIds: string[] = []
        const routableJobs: {
          id: string
          latitude: number
          longitude: number
        }[] = []

        for (const job of jobs as JobRow[]) {
          if (job.latitude && job.longitude) {
            routableJobs.push({
              id: job.id,
              latitude: job.latitude,
              longitude: job.longitude,
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

        const optimizeResult = await optimizeRoute(
          { latitude: startLatitude!, longitude: startLongitude! },
          routableJobs
        )

        if (!optimizeResult) {
          send({
            step: 'error',
            message:
              'Route optimization service is unavailable right now. Please try again shortly.',
          })
          controller.close()
          return
        }

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

        // ── Step 6: Save ─────────────────────────────────────────
        send({ step: 'saving', message: 'Saving your optimized route...' })

        await Promise.all(
          optimizeResult.orderedJobIds.map((jobId, index) =>
            supabase
              .from('jobs')
              .update({ order_index: index })
              .eq('id', jobId)
          )
        )

        const { data: existing } = await supabase
          .from('routes')
          .select('id')
          .eq('scheduled_date', date)
          .maybeSingle()

        const { data: savedRoute, error: upsertError } = await supabase
          .from('routes')
          .upsert(
            {
              user_id: userId,
              scheduled_date: date,
              status: 'optimized',
              total_distance_km: Math.round(
                ((directions
                  ? directions.distanceMeters
                  : optimizeResult.distanceMeters) /
                  1000) *
                  10
              ) / 10,
              total_duration_mins: Math.round(
                (directions
                  ? directions.durationSeconds
                  : optimizeResult.durationSeconds) / 60
              ),
              start_location: startLocationText,
              start_latitude: startLatitude,
              start_longitude: startLongitude,
              optimization_result: {
                orderedJobIds: optimizeResult.orderedJobIds,
                geometry: directions?.geometry ?? [],
              },
              is_recalculated: !!existing,
              recalculated_at: existing ? new Date().toISOString() : null,
            },
            { onConflict: 'user_id,scheduled_date' }
          )
          .select()
          .single()

        if (upsertError) {
          console.error('Route upsert error:', JSON.stringify(upsertError))
          send({ step: 'error', message: 'Failed to save the optimized route.' })
          controller.close()
          return
        }

        // ── Complete ─────────────────────────────────────────────
        send({
          step: 'complete',
          route: savedRoute,
          skippedJobIds,
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
