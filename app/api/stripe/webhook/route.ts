import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import stripe from '@/lib/stripe'
import Stripe from 'stripe'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const userId = session.metadata?.supabase_user_id
        const billingCycle = session.metadata?.billing_cycle as 'monthly' | 'yearly'
        if (!userId) break

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
          { expand: ['items.data.price'] }
        )

        const item = subscription.items.data[0]
        const priceId = item.price.id
        const amount = item.price.unit_amount! / 100
        const periodStart = new Date((item as any).current_period_start * 1000).toISOString()
        const periodEnd = new Date((item as any).current_period_end * 1000).toISOString()

        await supabaseAdmin.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            stripe_product_id: item.price.product as string,
            plan_name: 'starter',
            billing_cycle: billingCycle ?? 'monthly',
            status: 'active',
            amount,
            currency: subscription.currency,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
          { onConflict: 'stripe_subscription_id' }
        )
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (!userId) break

        const item = subscription.items.data[0]
        const periodStart = new Date((item as any).current_period_start * 1000).toISOString()
        const periodEnd = new Date((item as any).current_period_end * 1000).toISOString()

        const status = subscription.status as
          | 'active'
          | 'past_due'
          | 'cancelled'
          | 'unpaid'
          | 'incomplete'
          | 'trialing'

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            cancelled_at: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : null,
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).parent?.subscription_details?.subscription as string
          ?? (invoice as any).subscription as string
        if (!subscriptionId) break

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'past_due',
            last_payment_error: 'Payment failed',
          })
          .eq('stripe_subscription_id', subscriptionId)
        break
      }

      default:
        break
    }
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true })
}