import { createClient } from '@/lib/supabase/server'

// CREEM_TEST_MODE=true 强制使用测试环境（不受 NODE_ENV 影响）
// 如果填的是 test key/test product，务必设为 true
const CREEM_BASE = process.env.CREEM_TEST_MODE === 'true'
  ? 'https://test-api.creem.io'
  : 'https://api.creem.io'

export async function POST() {
  const apiKey = process.env.CREEM_API_KEY
  const productId = process.env.NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-uztu.vercel.app'

  if (!apiKey || !productId) {
    console.error('[creem/checkout] Missing env: apiKey=%s productId=%s', !!apiKey, !!productId)
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Creem REST API uses snake_case field names
  const requestBody = {
    product_id: productId,
    success_url: `${appUrl}/settings?upgraded=1`,
    request_id: user.id,
    metadata: {
      userId: user.id,
      email: user.email ?? '',
    },
  }

  console.log('[creem/checkout] → %s/v1/checkouts body=%o', CREEM_BASE, requestBody)

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
    console.log('[creem/checkout] ← status=%d body=%o', res.status, data)

    if (!res.ok) {
      return Response.json(
        { error: 'Checkout creation failed', detail: data },
        { status: 502 }
      )
    }

    // Creem REST returns checkout_url (snake_case); SDK exposes checkoutUrl (camel)
    const checkoutUrl = data.checkout_url ?? data.checkoutUrl
    if (!checkoutUrl) {
      console.error('[creem/checkout] No URL in response:', JSON.stringify(data))
      return Response.json({ error: 'No checkout URL returned', detail: data }, { status: 502 })
    }

    return Response.json({ checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout] fetch threw:', err)
    return Response.json({ error: 'Network error', detail: String(err) }, { status: 500 })
  }
}
