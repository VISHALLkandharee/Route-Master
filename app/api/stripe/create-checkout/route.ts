import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import stripe from '@/lib/stripe'
import { getAppUrl } from '@/lib/app-url'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  const priceId =
    typeof body === 'object' && body !== null && 'priceId' in body
      ? (body as { priceId?: unknown }).priceId
      : null
  const billingCycle =
    typeof body === 'object' && body !== null && 'billingCycle' in body
      ? (body as { billingCycle?: unknown }).billingCycle
      : null
  const expectedPriceId =
    billingCycle === 'monthly'
      ? process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
      : billingCycle === 'yearly'
        ? process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID
        : undefined

  if (typeof priceId !== 'string' || !expectedPriceId || priceId !== expectedPriceId) {
    return NextResponse.json({ error: 'Selected billing plan is invalid.' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, stripe_customer_id')
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Reuse existing Stripe customer or create a new one
  let customerId = profile.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: profile.full_name,
      metadata: { supabase_user_id: userData.user.id },
    })
    customerId = customer.id

    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userData.user.id)
  }

  const baseUrl = getAppUrl()

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/settings?billing=success`,
    cancel_url: `${baseUrl}/dashboard/settings?billing=cancelled`,
    metadata: {
      supabase_user_id: userData.user.id,
      billing_cycle: billingCycle as 'monthly' | 'yearly',
    },
    subscription_data: {
      metadata: {
        supabase_user_id: userData.user.id,
      },
    },
  })

  return NextResponse.json({ url: session.url })
}
