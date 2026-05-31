import { createClient } from '@/lib/supabase/server'

const CREEM_BASE = process.env.CREEM_TEST_MODE === 'true'
  ? 'https://test-api.creem.io'
  : 'https://api.creem.io'

const PLAN_CONFIG = {
  starter:  { productIdEnv: 'NEXT_PUBLIC_CREEM_STARTER_PRODUCT_ID',  label: 'Starter'  },
  standard: { productIdEnv: 'NEXT_PUBLIC_CREEM_STANDARD_PRODUCT_ID', label: 'Standard' },
} as const

type Plan = keyof typeof PLAN_CONFIG

export async function POST(req: Request) {
  const apiKey = process.env.CREEM_API_KEY
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-uztu.vercel.app'

  if (!apiKey) {
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  // Parse plan from request body — default to standard
  let plan: Plan = 'standard'
  try {
    const body = await req.json()
    if (body.plan === 'starter' || body.plan === 'standard') plan = body.plan
  } catch {}

  const productId = process.env[PLAN_CONFIG[plan].productIdEnv]
  if (!productId) {
    console.error('[creem/checkout] Missing env: %s', PLAN_CONFIG[plan].productIdEnv)
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestBody = {
    product_id: productId,
    success_url: `${appUrl}/settings?upgraded=1&plan=${plan}`,
    request_id: user.id,
    metadata: { userId: user.id, email: user.email ?? '', plan },
  }

  console.log('[creem/checkout] plan=%s → %s/v1/checkouts', plan, CREEM_BASE)

  try {
    const res = await fetch(`${CREEM_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const data = await res.json()
    console.log('[creem/checkout] status=%d body=%o', res.status, data)

    if (!res.ok) {
      return Response.json({ error: 'Checkout creation failed', detail: data }, { status: 502 })
    }

    const checkoutUrl = data.checkout_url ?? data.checkoutUrl
    if (!checkoutUrl) {
      return Response.json({ error: 'No checkout URL returned', detail: data }, { status: 502 })
    }

    return Response.json({ checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout] fetch threw:', err)
    return Response.json({ error: 'Network error', detail: String(err) }, { status: 500 })
  }
}
