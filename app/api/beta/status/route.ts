import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const preferredRegion = ['hkg1', 'sin1']

const BETA_TOTAL_SLOTS = 100

export async function GET() {
  const admin = createAdminClient()

  // Count claimed spots (no auth needed for count)
  const { count } = await admin
    .from('user_quota')
    .select('*', { count: 'exact', head: true })
    .eq('is_beta_user', true)

  const claimed = count ?? 0
  const remaining = Math.max(0, BETA_TOTAL_SLOTS - claimed)

  // Check current user's status if logged in
  let userIsBeta = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await admin
        .from('user_quota')
        .select('is_beta_user, tier')
        .eq('user_id', user.id)
        .single()
      userIsBeta = data?.is_beta_user === true || data?.tier === 'beta_vip'
    }
  } catch { /* not logged in */ }

  return Response.json({ total: BETA_TOTAL_SLOTS, claimed, remaining, userIsBeta })
}
