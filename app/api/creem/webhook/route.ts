import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

interface CreemWebhookEvent {
  id: string
  eventType: string
  object: {
    request_id?: string
    id: string
    customer: { id: string }
    product: { id: string; billing_type: string }
    status: string
    metadata?: { userId?: string; email?: string; plan?: string }
  }
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const computed = createHmac('sha256', secret).update(payload).digest('hex')
  return computed === signature
}

function getTierByProductId(productId: string): { tier: string; monthlyLimit: number } | null {
  const starterPid  = process.env.NEXT_PUBLIC_CREEM_STARTER_PRODUCT_ID
  const standardPid = process.env.NEXT_PUBLIC_CREEM_STANDARD_PRODUCT_ID
  if (starterPid  && productId === starterPid)  return { tier: 'starter',  monthlyLimit: 1000 }
  if (standardPid && productId === standardPid) return { tier: 'standard', monthlyLimit: 3000 }
  return null
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
  try { event = JSON.parse(rawBody) }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  console.log('[creem/webhook] eventType=%s productId=%s', event.eventType, event.object.product.id)

  const admin = createAdminClient()
  const isSubscription = event.object.product.billing_type === 'recurring'
  const userId = event.object.metadata?.userId || event.object.request_id

  if (!userId) {
    console.warn('[creem/webhook] No userId in event — skipping')
    return Response.json({ ok: true })
  }

  // ── Subscription activated / renewed ─────────────────────────────────────────
  if (isSubscription && (event.eventType === 'subscription.paid' || event.eventType === 'subscription.active')) {
    const tierInfo = getTierByProductId(event.object.product.id)

    if (!tierInfo) {
      console.warn('[creem/webhook] Unknown product %s — no tier mapping', event.object.product.id)
      return Response.json({ ok: true })
    }

    await admin.from('user_quota').upsert(
      {
        user_id: userId,
        tier: tierInfo.tier,
        chat_count_monthly_limit: tierInfo.monthlyLimit,
        chat_count_daily_limit: 50,
        creem_customer_id: event.object.customer.id,
        creem_subscription_id: event.object.id,
      },
      { onConflict: 'user_id' }
    )
    console.log('[creem/webhook] ✓ userId=%s → tier=%s limit=%d', userId, tierInfo.tier, tierInfo.monthlyLimit)
  }

  // ── Subscription cancelled / expired ─────────────────────────────────────────
  if (isSubscription && (event.eventType === 'subscription.canceled' || event.eventType === 'subscription.expired')) {
    await admin.from('user_quota').update({
      tier: 'free',
      chat_count_monthly_limit: 0,
      chat_count_daily_limit: 50,
      creem_subscription_id: null,
    }).eq('user_id', userId)
    console.log('[creem/webhook] ✓ userId=%s downgraded to FREE (%s)', userId, event.eventType)
  }

  return Response.json({ ok: true })
}
