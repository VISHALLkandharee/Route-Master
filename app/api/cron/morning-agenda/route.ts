import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/sender'
import { morningAgendaEmail, type AgendaJob } from '@/lib/email/templates'

// Resend's SDK is fine on Node; keep this route off the Edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type UserRow = {
  id: string
  full_name: string
  email: string
  business_name: string | null
  timezone: string | null
  subscription_status: string
  trial_ends_at: string
  // Key stays "email_summary" so existing stored preferences keep working.
  notification_preferences: { email_summary?: boolean } | null
}

type JobRow = {
  title: string
  scheduled_time: string
  address: string
  price: number | null
  clients: { full_name: string } | { full_name: string }[] | null
}

function isBlocked(status: string, trialEndsAt: string): boolean {
  if (status === 'cancelled' || status === 'unpaid') return true
  if (status === 'trial' && new Date(trialEndsAt).getTime() < Date.now()) return true
  return false
}

// "Today" in the user's own timezone, as YYYY-MM-DD (matches jobs.scheduled_date)
function todayInTimezone(timeZone: string): { isoDate: string; label: string } {
  const now = new Date()
  let tz = timeZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  return { isoDate, label }
}

function formatTime(time: string): string {
  const [hh, mm] = time.split(':')
  const hour = Number(hh)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${mm} ${suffix}`
}

function clientName(clients: JobRow['clients']): string {
  if (!clients) return 'Client'
  return Array.isArray(clients) ? clients[0]?.full_name ?? 'Client' : clients.full_name
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  // Service-role client: reads all users, bypasses RLS. Server-only, never expose.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select(
      'id, full_name, email, business_name, timezone, subscription_status, trial_ends_at, notification_preferences'
    )
    .limit(1000)

  if (usersError) {
    console.error('[cron:morning-agenda] users query failed:', usersError.message)
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const result = { checked: 0, sent: 0, skipped: 0, failed: 0, dryRun }

  for (const user of (users ?? []) as UserRow[]) {
    result.checked++

    const wantsAgenda = user.notification_preferences?.email_summary !== false
    if (!wantsAgenda || isBlocked(user.subscription_status, user.trial_ends_at)) {
      result.skipped++
      continue
    }

    const { isoDate, label } = todayInTimezone(user.timezone ?? 'UTC')

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('title, scheduled_time, address, price, clients(full_name)')
      .eq('user_id', user.id)
      .eq('scheduled_date', isoDate)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('scheduled_time', { ascending: true })

    if (jobsError) {
      console.error(`[cron:morning-agenda] jobs query failed for ${user.id}:`, jobsError.message)
      result.failed++
      continue
    }

    if (!jobs || jobs.length === 0) {
      result.skipped++ // no jobs today, so no email
      continue
    }

    const agendaJobs: AgendaJob[] = (jobs as unknown as JobRow[]).map((j) => ({
      title: j.title,
      time: formatTime(j.scheduled_time),
      clientName: clientName(j.clients),
      address: j.address,
      price: j.price,
    }))

    const email = morningAgendaEmail({
      name: user.full_name,
      businessName: user.business_name,
      dateLabel: label,
      jobs: agendaJobs,
      dashboardUrl: `${appUrl}/dashboard`,
    })

    if (dryRun) {
      result.sent++
      continue
    }

    const sent = await sendEmail({ to: user.email, ...email })
    if (sent.ok) result.sent++
    else result.failed++
  }

  return NextResponse.json(result)
}