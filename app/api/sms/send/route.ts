import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { generateSMSMessage, MAX_SMS_CHARACTERS, OPT_OUT_SUFFIX } from '@/lib/sms/generate-message'
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
  status: 'pending' | 'in_progress'
  sms_sent: boolean
  order_index: number
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
    .select('id, title, scheduled_time, latest_start_time, estimated_duration, status, sms_sent, order_index, client:clients(id, full_name, phone, preferred_contact)')
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

  const eligibleJobs: JobWithClient[] = []
  const skippedDetails: { jobId: string; clientName: string; jobTitle: string; reason: string }[] = []
  for (const job of routeJobs) {
    const client = job.client
    let reason: string | null = null

    if (job.status === 'in_progress') reason = 'The visit has already started'
    else if (job.sms_sent) reason = 'An arrival text was already sent'
    else if (appointmentConflictJobIds.has(job.id)) reason = 'Confirm the appointment timing before messaging'
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

  const previewToken = createHash('sha256').update(JSON.stringify({
    date,
    routeStatus: route.status,
    orderedJobIds,
    appointmentConflictJobIds: [...appointmentConflictJobIds].sort(),
    jobs: routeJobs.map((job) => ({
      id: job.id,
      title: job.title,
      scheduled_time: job.scheduled_time,
      latest_start_time: job.latest_start_time,
      status: job.status,
      sms_sent: job.sms_sent,
      order_index: job.order_index,
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
      message: await generateSMSMessage({
        clientName: job.client!.full_name,
        businessName,
        jobTitle: job.title,
        scheduledTime: job.scheduled_time,
        latestStartTime: job.latest_start_time,
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
