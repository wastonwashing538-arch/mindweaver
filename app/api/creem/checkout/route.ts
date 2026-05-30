import { createClient } from '@/lib/supabase/server'

const CREEM_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.creem.io'
  : 'https://test-api.creem.io'

export async function POST() {
  const apiKey = process.env.CREEM_API_KEY
  const productId = process.env.NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-three.vercel.app'

  if (!apiKey || !productId) {
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`${CREEM_BASE}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        success_url: `${appUrl}/settings?upgraded=1`,
        request_id: user.id,
        metadata: {
          userId: user.id,
          email: user.email ?? '',
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[creem/checkout] API error', res.status, data)
      return Response.json({ error: 'Checkout creation failed' }, { status: 502 })
    }

    // Creem may return checkout_url (snake) or checkoutUrl (camel)
    const checkoutUrl = data.checkout_url ?? data.checkoutUrl
    if (!checkoutUrl) {
      console.error('[creem/checkout] No checkout URL in response', data)
      return Response.json({ error: 'No checkout URL returned' }, { status: 502 })
    }

    return Response.json({ checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout]', err)
    return Response.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
