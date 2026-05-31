import { createClient } from '@/lib/supabase/server'

const CREEM_BASE = process.env.CREEM_TEST_MODE === 'true'
  ? 'https://test-api.creem.io'
  : 'https://api.creem.io'

// Read env vars with STATIC keys (required for Next.js/Turbopack to resolve correctly)
const STARTER_PRODUCT_ID  = process.env.NEXT_PUBLIC_CREEM_STARTER_PRODUCT_ID
const STANDARD_PRODUCT_ID = process.env.NEXT_PUBLIC_CREEM_STANDARD_PRODUCT_ID
// Legacy fallback: if only one product is configured, use it for both plans
const LEGACY_PRODUCT_ID   = process.env.NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID

export async function POST(req: Request) {
  const apiKey = process.env.CREEM_API_KEY
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-uztu.vercel.app'

  if (!apiKey) {
    console.error('[creem/checkout] CREEM_API_KEY not set')
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  // Parse plan — default to standard
  let plan: 'starter' | 'standard' = 'standard'
  try {
    const body = await req.json()
    if (body.plan === 'starter' || body.plan === 'standard') plan = body.plan
  } catch { /* body might be empty */ }

  // Resolve product ID: try plan-specific → fallback to legacy single-product
  const productId = plan === 'starter'
    ? (STARTER_PRODUCT_ID ?? LEGACY_PRODUCT_ID)
    : (STANDARD_PRODUCT_ID ?? LEGACY_PRODUCT_ID)

  if (!productId) {
    console.error('[creem/checkout] No product ID for plan=%s. Set NEXT_PUBLIC_CREEM_STARTER_PRODUCT_ID, NEXT_PUBLIC_CREEM_STANDARD_PRODUCT_ID, or NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID', plan)
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestBody = {
    product_id: productId,
    success_url: `${appUrl}/settings?upgraded=1&plan=${plan}`,
    request_id: user.id,
    metadata: { userId: user.id, email: user.email ?? '', plan },
  }

  console.log('[creem/checkout] plan=%s productId=%s → %s', plan, productId, CREEM_BASE)

  try {
    const res = await fetch(`${CREEM_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const data = await res.json()
    console.log('[creem/checkout] response status=%d', res.status)

    if (!res.ok) {
      console.error('[creem/checkout] Creem error:', data)
      return Response.json({ error: 'Checkout creation failed', detail: data }, { status: 502 })
    }

    const checkoutUrl = data.checkout_url ?? data.checkoutUrl
    if (!checkoutUrl) {
      console.error('[creem/checkout] No URL in response:', data)
      return Response.json({ error: 'No checkout URL returned', detail: data }, { status: 502 })
    }

    return Response.json({ checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout] fetch error:', err)
    return Response.json({ error: 'Network error calling Creem', detail: String(err) }, { status: 500 })
  }
}
