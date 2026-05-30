import { createHmac } from 'crypto'
import { createClient } from '@/lib/supabase/server'

const VIP_MONTHLY_LIMIT = 3000

interface CreemWebhookEvent {
  id: string
  eventType: string
  object: {
    request_id?: string        // userId for one-time payments
    id: string                 // payment or subscription ID
    customer: { id: string }
    product: { id: string; billing_type: string }
    status: string
    metadata?: { userId?: string; email?: string }
  }
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const computed = createHmac('sha256', secret).update(payload).digest('hex')
  return computed === signature
}

export async function POST(req: Request) {
  const secret = process.env.CREEM_WEBHOOK_SECRET
  if (!secret) {
    console.error('[creem/webhook] CREEM_WEBHOOK_SECRET not set')
    return Response.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('creem-signature') ?? ''

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn('[creem/webhook] Invalid signature')
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: CreemWebhookEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[creem/webhook] eventType=%s id=%s', event.eventType, event.id)

  const supabase = await createClient()
  const isSubscription = event.object.product.billing_type === 'recurring'

  // ── One-time payment ──────────────────────────────────────────────────────────
  if (!isSubscription && event.eventType === 'checkout.completed') {
    const userId = event.object.request_id || event.object.metadata?.userId
    if (!userId) {
      console.warn('[creem/webhook] checkout.completed: no userId found')
      return Response.json({ ok: true })
    }
    // For future one-time products — no action needed for subscription-only model
    console.log('[creem/webhook] one-time payment for userId=%s', userId)
  }

  // ── Subscription ──────────────────────────────────────────────────────────────
  if (isSubscription) {
    const userId = event.object.metadata?.userId
    if (!userId) {
      console.warn('[creem/webhook] subscription event: no userId in metadata')
      return Response.json({ ok: true })
    }
    const subscriptionId = event.object.id
    const customerId = event.object.customer.id

    if (event.eventType === 'subscription.paid') {
      // Upgrade to VIP
      await supabase.from('user_quota').upsert(
        {
          user_id: userId,
          tier: 'vip',
          chat_count_monthly_limit: VIP_MONTHLY_LIMIT,
          chat_count_daily_limit: 50,     // not used for VIP but keep default
          creem_customer_id: customerId,
          creem_subscription_id: subscriptionId,
        },
        { onConflict: 'user_id' }
      )
      console.log('[creem/webhook] upgraded userId=%s to VIP', userId)
    }

    if (event.eventType === 'subscription.canceled' || event.eventType === 'subscription.expired') {
      // Downgrade to FREE
      await supabase.from('user_quota').update({
        tier: 'free',
        chat_count_monthly_limit: 0,
        chat_count_daily_limit: 50,
        creem_subscription_id: null,
      }).eq('user_id', userId)
      console.log('[creem/webhook] downgraded userId=%s to FREE (%s)', userId, event.eventType)
    }
  }

  return Response.json({ ok: true })
}
