import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type SubscriptionAccess =
  | { status: 'allowed' }
  | { status: 'unauthenticated' }
  | { status: 'blocked' }
  | { status: 'unavailable' }

export function hasProductAccess(
  status: string | null,
  trialEndsAt: string | null,
  now = Date.now(),
): boolean {
  if (status === 'active' || status === 'past_due') return true
  if (status !== 'trial' && status !== 'trialing') return false

  const trialEnd = trialEndsAt ? Date.parse(trialEndsAt) : Number.NaN
  return Number.isFinite(trialEnd) && trialEnd > now
}

export async function getSubscriptionAccess(
  supabase: SupabaseServerClient,
  authenticatedUserId?: string,
): Promise<SubscriptionAccess> {
  let userId = authenticatedUserId
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) return { status: 'unauthenticated' }
    userId = userData.user.id
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('subscription_status, trial_ends_at')
    .eq('id', userId)
    .single()

  if (error || !profile) return { status: 'unavailable' }

  return hasProductAccess(profile.subscription_status, profile.trial_ends_at)
    ? { status: 'allowed' }
    : { status: 'blocked' }
}
