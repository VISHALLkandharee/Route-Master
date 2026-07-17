import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSMSMessage } from '@/lib/sms/generate-message'
import { sendSMS } from '@/lib/sms/sender'

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

  const { date } = await request.json()
  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  }

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
    .select('id, title, scheduled_time, estimated_duration, sms_sent, order_index, client:clients(id, full_name, phone, preferred_contact)')
    .eq('scheduled_date', date)
    .in('status', ['pending', 'in_progress'])
    .is('deleted_at', null)
    .order('order_index', { ascending: true })

  if (jobsError) {
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ error: 'No jobs scheduled for this day' }, { status: 400 })
  }

  const totalStops = jobs.length
  const results = {
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [] as { jobId: string; status: string; reason?: string }[],
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i] as unknown as JobWithClient
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

    // Client opted out — skip
    if (!client || client.preferred_contact === 'none') {
      results.skipped++
      results.details.push({
        jobId: job.id,
        status: 'skipped',
        reason: 'Client opted out of notifications',
      })
      continue
    }

    try {
      // Generate AI message
      const message = await generateSMSMessage({
        clientName: client.full_name,
        businessName,
        jobTitle: job.title,
        scheduledTime: job.scheduled_time,
        stopNumber: i + 1,
        totalStops,
      })

      // Send (mock in development, real Twilio in production)
      await sendSMS(client.phone, message)

      // Save to database
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          sms_sent: true,
          sms_sent_at: new Date().toISOString(),
          ai_message: message,
        })
        .eq('id', job.id)

      if (updateError) throw updateError

      results.sent++
      results.details.push({ jobId: job.id, status: 'sent' })
    } catch (error) {
      console.error(`SMS failed for job ${job.id}:`, error)
      results.failed++
      results.details.push({ jobId: job.id, status: 'failed' })
    }
  }

  return NextResponse.json(results)
}