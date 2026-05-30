import { createClient } from '@/lib/supabase/server'
import { Creem } from 'creem'

// 0 = production, 1 = test
const creem = new Creem({ serverIdx: process.env.NODE_ENV === 'production' ? 0 : 1 })

export async function POST(req: Request) {
  const apiKey = process.env.CREEM_API_KEY
  const productId = process.env.NEXT_PUBLIC_CREEM_VIP_PRODUCT_ID
  const appUrl = process.env.NEXT_PUBLIC_CREEM_APP_URL ?? 'https://mindweaver-three.vercel.app'

  if (!apiKey || !productId) {
    return Response.json({ error: 'Payment not configured' }, { status: 503 })
  }

  // Must be authenticated to checkout
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await creem.createCheckout({
      xApiKey: apiKey,
      createCheckoutRequest: {
        productId,
        successUrl: `${appUrl}/settings?upgraded=1`,
        requestId: user.id,          // echoed in one-time webhook as request_id
        metadata: {
          userId: user.id,
          email: user.email ?? '',
        },
      },
    })

    return Response.json({ checkoutUrl: result.checkoutUrl })
  } catch (err) {
    console.error('[creem/checkout]', err)
    return Response.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
