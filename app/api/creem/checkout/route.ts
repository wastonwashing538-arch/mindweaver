import { createClient } from '@/lib/supabase/server'

const CREEM_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.creem.io'
  : 'https://test-api.creem.io'

export async function POST() {
  const apiKey = process.env.CREEM_API_KEY
  const productId = process.env.NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-uztu.vercel.app'

  if (!apiKey || !productId) {
    console.error('[creem/checkout] Missing env vars: apiKey=%s productId=%s', !!apiKey, !!productId)
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Creem REST API uses camelCase field names (same as SDK)
  const requestBody = {
    productId,
    successUrl: `${appUrl}/settings?upgraded=1`,
    requestId: user.id,
    metadata: {
      userId: user.id,
      email: user.email ?? '',
    },
  }

  console.log('[creem/checkout] POST %s/v1/checkouts body=%o', CREEM_BASE, requestBody)

  try {
    const res = await fetch(`${CREEM_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = await res.json()
    console.log('[creem/checkout] response status=%d body=%o', res.status, data)

    if (!res.ok) {
      return Response.json(
        { error: 'Checkout creation failed', detail: data },
        { status: 502 }
      )
    }

    // Creem returns checkoutUrl (camel) — also handle checkout_url (snake) as fallback
    const checkoutUrl = data.checkoutUrl ?? data.checkout_url
    if (!checkoutUrl) {
      console.error('[creem/checkout] No checkout URL in response. Full response:', JSON.stringify(data))
      return Response.json({ error: 'No checkout URL returned', detail: data }, { status: 502 })
    }

    return Response.json({ checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout] fetch threw:', err)
    return Response.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
