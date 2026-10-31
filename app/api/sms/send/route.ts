import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { generateSMSMessage, MAX_SMS_CHARACTERS, OPT_OUT_SUFFIX } from '@/lib/sms/generate-message'
import { isSmsDeliveryConfigured, sendSMS } from '@/lib/sms/sender'
import { rateLimit } from '@/lib/rate-limit'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { isDateOnly } from '@/lib/validation'
import { getDirections } from '@/lib/ors/directions'
import { estimateStopArrivals } from '@/lib/time/arrival-estimate'
import { zonedTimeToUnixSeconds } from '@/lib/time/zoned-time'

interface ClientRecord {
  id: string
  full_name: string
  phone: string
  preferred_contact: string
}

interface JobWithClient {
  id: string
  title: string
  scheduled_time: string
  latest_start_time: string | null
  estimated_duration: number
  status: 'pending' | 'in_progress' | 'completed'
  sms_sent: boolean
  order_index: number
  latitude: number | null
  longitude: number | null
  visit_started_at: string | null
  completed_at: string | null
  client: ClientRecord | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // ── Auth ────────────────────────────────────────────────────
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = userData.user.id;  

  const access = await getSubscriptionAccess(supabase, userId)
  if (access.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (access.status === 'blocked') {
    return NextResponse.json({ error: 'An active trial or subscription is required.' }, { status: 402 })
  }
  if (access.status === 'unavailable') {
    return NextResponse.json({ error: 'Account access could not be verified.' }, { status: 503 })
  }

  const limit = await rateLimit(`sms:${userId}`, {
    windowMs: 60 * 1000,  // 1 minute
    max: 5,               // 5 SMS sends per minute per user
  })

  if (!limit.available) {
    return NextResponse.json({ error: 'Messaging service is temporarily unavailable.' }, { status: 503 })
  }
  if (!limit.success) {
    return NextResponse.json(
      { error: `Too many requests. Please wait ${limit.retryAfterSeconds} seconds before sending again.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  const date =
    typeof body === 'object' && body !== null && 'date' in body
      ? (body as { date?: unknown }).date
      : null
  if (!isDateOnly(date)) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  }
  const mode = typeof body === 'object' && body !== null && 'mode' in body
    ? (body as { mode?: unknown }).mode
    : null
  if (mode !== 'preview' && mode !== 'send') {
    return NextResponse.json({ error: 'Review messages before sending them.' }, { status: 400 })
  }
  if (mode === 'send' && !isSmsDeliveryConfigured()) {
    return NextResponse.json(
      { error: 'SMS delivery is not configured. Contact support before sending client messages.' },
      { status: 503 },
    )
  }

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('status, optimization_result, start_latitude, start_longitude, started_at')
    .eq('scheduled_date', date)
    .maybeSingle()
  if (routeError) {
    return NextResponse.json({ error: 'Could not verify the route status.' }, { status: 500 })
  }
  if (!route || !['optimized', 'in_progress', 'completed'].includes(route.status)) {
    return NextResponse.json(
      { error: 'Optimize this day’s route before sending arrival updates.' },
      { status: 409 },
    )
  }
  const orderedJobIds = Array.isArray(route.optimization_result?.orderedJobIds)
    ? route.optimization_result.orderedJobIds.filter((id: unknown): id is string => typeof id === 'string')
    : []
  if (orderedJobIds.length === 0) {
    return NextResponse.json(
      { error: 'Build and save a route with at least one stop before sending arrival updates.' },
      { status: 409 },
    )
  }
  const appointmentConflictJobIds = new Set(
    Array.isArray(route.optimization_result?.appointmentConflictJobIds)
      ? route.optimization_result.appointmentConflictJobIds.filter((id: unknown): id is string => typeof id === 'string')
      : [],
  )

  // ── Business name ───────────────────────────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('full_name, business_name, timezone, workday_start')
    .single()

  const businessName =
    profile?.business_name || profile?.full_name || 'Your service provider'

  // ── Load jobs in optimized order ────────────────────────────
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, title, scheduled_time, latest_start_time, estimated_duration, status, sms_sent, order_index, latitude, longitude, visit_started_at, completed_at, client:clients(id, full_name, phone, preferred_contact)')
    .eq('scheduled_date', date)
    .in('status', ['pending', 'in_progress', 'completed'])
    .is('deleted_at', null)
    .order('order_index', { ascending: true })
    .limit(51)

  if (jobsError) {
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ error: 'No jobs scheduled for this day' }, { status: 400 })
  }

  if (jobs.length > 50) {
    return NextResponse.json(
      { error: 'This route has more than 50 jobs. Split it into smaller days before sending messages.' },
      { status: 400 },
    )
  }

  const routeJobs = (jobs as unknown as JobWithClient[])
    .filter((job) => orderedJobIds.includes(job.id))
  if (routeJobs.length === 0) {
    return NextResponse.json({ error: 'There are no active stops in this saved route to message.' }, { status: 400 })
  }

  const eligibleJobs: JobWithClient[] = []
  const skippedDetails: { jobId: string; clientName: string; jobTitle: string; reason: string }[] = []
  for (const job of routeJobs) {
    const client = job.client
    let reason: string | null = null

    if (job.status === 'completed') reason = 'The visit is already complete'
    else if (job.status === 'in_progress') reason = 'The visit has already started'
    else if (job.sms_sent) reason = 'An arrival text was already sent'
    else if (!client || client.preferred_contact !== 'sms') {
      reason = client?.preferred_contact === 'call'
        ? 'Client prefers phone calls'
        : 'Client has not opted in to SMS'
    }

    if (reason) {
      skippedDetails.push({ jobId: job.id, clientName: client?.full_name ?? 'Client', jobTitle: job.title, reason })
    } else {
      eligibleJobs.push(job)
    }
  }

  // Calculate fresh arrival estimates for the pending route from the best
  // known starting point. Directions failures never block message review.
  const etaByJobId = new Map<string, { displayTime: string; isLate: boolean }>()
  let etaAvailable = false
  let etaStartBasis: string | null = null
  const pendingRouteJobs = routeJobs.filter((job) => job.status === 'pending')
  const allPendingJobsLocated = pendingRouteJobs.length > 0 && pendingRouteJobs.every(
    (job) => typeof job.latitude === 'number' && typeof job.longitude === 'number',
  )
  const timezone = profile?.timezone
  const workdayStartSeconds = timezone && profile?.workday_start
    ? zonedTimeToUnixSeconds(date, profile.workday_start, timezone)
    : null

  if (timezone && workdayStartSeconds !== null && allPendingJobsLocated) {
    let startLatitude = typeof route.start_latitude === 'number' ? route.start_latitude : null
    let startLongitude = typeof route.start_longitude === 'number' ? route.start_longitude : null
    let initialServiceSeconds = 0
    const activeSegment = route.optimization_result?.activeSegment
    const activeJob = routeJobs.find((job) => job.status === 'in_progress')
    const latestCompletedJob = [...routeJobs].reverse().find((job) => job.status === 'completed')

    if (
      route.status === 'in_progress' && activeSegment &&
      typeof activeSegment.latitude === 'number' && typeof activeSegment.longitude === 'number'
    ) {
      etaStartBasis = 'the last replanned location'
      startLatitude = activeSegment.latitude
      startLongitude = activeSegment.longitude
      if (activeJob && activeSegment.currentStopJobId === activeJob.id && activeJob.visit_started_at) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(activeJob.visit_started_at)) / 1000))
        initialServiceSeconds = Math.max(0, activeJob.estimated_duration * 60 - elapsedSeconds)
      }
    } else if (route.status === 'in_progress' && activeJob && activeJob.latitude !== null && activeJob.longitude !== null) {
      etaStartBasis = 'the active visit location'
      startLatitude = activeJob.latitude
      startLongitude = activeJob.longitude
      if (activeJob.visit_started_at) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(activeJob.visit_started_at)) / 1000))
        initialServiceSeconds = Math.max(0, activeJob.estimated_duration * 60 - elapsedSeconds)
      }
    } else if (route.status === 'in_progress' && latestCompletedJob && latestCompletedJob.latitude !== null && latestCompletedJob.longitude !== null) {
      etaStartBasis = 'the last completed stop'
      startLatitude = latestCompletedJob.latitude
      startLongitude = latestCompletedJob.longitude
    } else if (startLatitude !== null && startLongitude !== null) {
      etaStartBasis = 'the saved route start'
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const todayValues = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]))
    const todayInTimezone = `${todayValues.year}-${todayValues.month}-${todayValues.day}`
    const departureSeconds = route.status === 'in_progress' || date <= todayInTimezone
      ? Math.max(workdayStartSeconds, nowSeconds)
      : workdayStartSeconds

    if (startLatitude !== null && startLongitude !== null) {
      try {
        const directions = await getDirections([
          [startLongitude, startLatitude],
          ...pendingRouteJobs.map((job) => [job.longitude!, job.latitude!] as [number, number]),
        ])
        if (directions && directions.segmentDurationsSeconds.length === pendingRouteJobs.length) {
          const estimates = estimateStopArrivals({
            date,
            timezone,
            departureSeconds,
            initialServiceSeconds,
            stops: pendingRouteJobs.map((job) => ({
              jobId: job.id,
              scheduledTime: job.scheduled_time,
              latestStartTime: job.latest_start_time,
              estimatedDurationMinutes: job.estimated_duration,
            })),
            legDurationsSeconds: directions.segmentDurationsSeconds,
          })
          if (estimates) {
            for (const estimate of estimates) {
              etaByJobId.set(estimate.jobId, { displayTime: estimate.displayTime, isLate: estimate.isLate })
            }
            etaAvailable = estimates.length === pendingRouteJobs.length
          }
        }
      } catch (error) {
        console.warn('Arrival estimates unavailable; keeping appointment-based drafts.', error)
      }
    }
  }

  const previewToken = createHash('sha256').update(JSON.stringify({
    date,
    routeStatus: route.status,
    orderedJobIds,
    startLatitude: route.start_latitude,
    startLongitude: route.start_longitude,
    startedAt: route.started_at,
    activeSegment: route.optimization_result?.activeSegment ?? null,
    appointmentConflictJobIds: [...appointmentConflictJobIds].sort(),
    jobs: routeJobs.map((job) => ({
      id: job.id,
      title: job.title,
      scheduled_time: job.scheduled_time,
      latest_start_time: job.latest_start_time,
      status: job.status,
      sms_sent: job.sms_sent,
      order_index: job.order_index,
      latitude: job.latitude,
      longitude: job.longitude,
      estimated_duration: job.estimated_duration,
      visit_started_at: job.visit_started_at,
      completed_at: job.completed_at,
      client: job.client,
    })),
  })).digest('hex')

  if (mode === 'preview') {
    const messages = await Promise.all(eligibleJobs.map(async (job) => ({
      jobId: job.id,
      jobTitle: job.title,
      clientName: job.client!.full_name,
      phoneLast4: job.client!.phone.replace(/\D/g, '').slice(-4),
      scheduledTime: job.scheduled_time,
      latestStartTime: job.latest_start_time,
      estimatedArrivalTime: etaByJobId.get(job.id)?.displayTime ?? null,
      estimatedArrivalIsLate: etaByJobId.get(job.id)?.isLate ?? false,
      appointmentConflict: appointmentConflictJobIds.has(job.id),
      message: await generateSMSMessage({
        clientName: job.client!.full_name,
        businessName,
        jobTitle: job.title,
        scheduledTime: job.scheduled_time,
        latestStartTime: job.latest_start_time,
        estimatedArrivalTime: etaByJobId.get(job.id)?.displayTime ?? null,
        estimatedArrivalIsLate: etaByJobId.get(job.id)?.isLate ?? false,
      }),
    })))

    return NextResponse.json({
      previewToken,
      orderedJobIds,
      deliveryMode: process.env.NODE_ENV !== 'production'
        ? 'mock'
        : isSmsDeliveryConfigured() ? 'twilio' : 'unavailable',
      messages,
      skipped: skippedDetails,
      etaAvailable,
      etaStartBasis: etaAvailable ? etaStartBasis : null,
    })
  }

  const submittedMessages = typeof body === 'object' && body !== null && 'messages' in body
    ? (body as { messages?: unknown }).messages
    : null
  const expectedPreviewToken = typeof body === 'object' && body !== null && 'previewToken' in body
    ? (body as { previewToken?: unknown }).previewToken
    : null
  const expectedOrderedJobIds = typeof body === 'object' && body !== null && 'orderedJobIds' in body
    ? (body as { orderedJobIds?: unknown }).orderedJobIds
    : null

  if (
    expectedPreviewToken !== previewToken ||
    !Array.isArray(expectedOrderedJobIds) ||
    expectedOrderedJobIds.length !== orderedJobIds.length ||
    expectedOrderedJobIds.some((id, index) => id !== orderedJobIds[index])
  ) {
    return NextResponse.json(
      { error: 'The route or client details changed after review. Prepare the messages again.' },
      { status: 409 },
    )
  }

  if (!Array.isArray(submittedMessages) || submittedMessages.length !== eligibleJobs.length) {
    return NextResponse.json({ error: 'Review every eligible message before sending.' }, { status: 400 })
  }

  const messageByJobId = new Map<string, string>()
  for (const item of submittedMessages) {
    if (
      typeof item !== 'object' || item === null ||
      !('jobId' in item) || typeof item.jobId !== 'string' ||
      !('message' in item) || typeof item.message !== 'string' ||
      messageByJobId.has(item.jobId)
    ) {
      return NextResponse.json({ error: 'One or more reviewed messages are invalid.' }, { status: 400 })
    }

    const message = item.message.trim()
    if (
      message.length === 0 ||
      message.length > MAX_SMS_CHARACTERS ||
      !message.endsWith(OPT_OUT_SUFFIX.trim()) ||
      !eligibleJobs.some((job) => job.id === item.jobId)
    ) {
      return NextResponse.json(
        { error: `Messages must be under ${MAX_SMS_CHARACTERS} characters and retain the opt-out instruction.` },
        { status: 400 },
      )
    }
    messageByJobId.set(item.jobId, message)
  }

  if (eligibleJobs.some((job) => !messageByJobId.has(job.id))) {
    return NextResponse.json({ error: 'Review every eligible message before sending.' }, { status: 400 })
  }

  const results = {
    submitted: 0,
    skipped: skippedDetails.length,
    failed: 0,
    details: skippedDetails.map((item) => ({
      jobId: item.jobId,
      status: 'skipped',
      reason: item.reason,
    })) as { jobId: string; status: string; reason?: string }[],
  }

  for (const job of eligibleJobs) {
    const client = job.client
    if (!client) {
      results.failed++
      results.details.push({ jobId: job.id, status: 'failed', reason: 'Client details are unavailable' })
      continue
    }

    try {
      const message = messageByJobId.get(job.id)!

      // Send (mock in development, real Twilio in production)
      const smsResult = await sendSMS(client.phone, message)

      if (!smsResult.acceptedByProvider) {
        results.skipped++
        results.details.push({
          jobId: job.id,
          status: 'mocked',
          reason: 'Development mode prepared the message without sending it',
        })
        continue
      }

      // Save to database
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          sms_sent: true,
          sms_sent_at: new Date().toISOString(),
          sms_message: message,
        })
        .eq('id', job.id)

      if (updateError) throw updateError

      results.submitted++
      results.details.push({ jobId: job.id, status: 'submitted' })
    } catch (error) {
      console.error(`SMS failed for job ${job.id}:`, error)
      results.failed++
      results.details.push({ jobId: job.id, status: 'failed' })
    }
  }

  return NextResponse.json(results)
}
