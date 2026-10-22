import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSMSMessage } from '@/lib/sms/generate-message'
import { isSmsDeliveryConfigured, sendSMS } from '@/lib/sms/sender'
import { rateLimit } from '@/lib/rate-limit'
import { getSubscriptionAccess } from '@/lib/subscription-access'
import { isDateOnly } from '@/lib/validation'

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
  sms_sent: boolean
  order_index: number
  client: ClientRecord
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

  if (!isSmsDeliveryConfigured()) {
    return NextResponse.json(
      { error: 'SMS delivery is not configured. Contact support before sending client messages.' },
      { status: 503 },
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

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('status, optimization_result')
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
    .select('full_name, business_name')
    .single()

  const businessName =
    profile?.business_name || profile?.full_name || 'Your service provider'

  // ── Load jobs in optimized order ────────────────────────────
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, title, scheduled_time, latest_start_time, estimated_duration, sms_sent, order_index, client:clients(id, full_name, phone, preferred_contact)')
    .eq('scheduled_date', date)
    .in('status', ['pending', 'in_progress'])
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

  const results = {
    submitted: 0,
    skipped: 0,
    failed: 0,
    details: [] as { jobId: string; status: string; reason?: string }[],
  }

  for (let i = 0; i < routeJobs.length; i++) {
    const job = routeJobs[i]
    const client = job.client

    // Already sent — skip silently
    if (job.sms_sent) {
      results.skipped++
      results.details.push({
        jobId: job.id,
        status: 'skipped',
        reason: 'SMS already sent',
      })
      continue
    }

    // Do not send a stale appointment-time message for jobs whose route was
    // deliberately planned outside their saved time window.
    if (appointmentConflictJobIds.has(job.id)) {
      results.skipped++
      results.details.push({
        jobId: job.id,
        status: 'skipped',
        reason: 'Appointment timing needs confirmation before messaging',
      })
      continue
    }

    // Client opted out — skip
    if (!client || client.preferred_contact !== 'sms') {
      results.skipped++
      results.details.push({
        jobId: job.id,
        status: 'skipped',
        reason: client?.preferred_contact === 'call'
          ? 'Client prefers phone calls, not SMS'
          : 'Client opted out of SMS notifications',
      })
      continue
    }

    try {
      // Use the client's saved appointment window; this path needs no AI API.
      const message = await generateSMSMessage({
        clientName: client.full_name,
        businessName,
        jobTitle: job.title,
        scheduledTime: job.scheduled_time,
        latestStartTime: job.latest_start_time,
      })

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
