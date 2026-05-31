import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const preferredRegion = ['hkg1', 'sin1']

const BETA_TOTAL_SLOTS = 100
const BETA_MONTHLY_LIMIT = 50

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Check if already beta
  const { data: existing } = await admin
    .from('user_quota')
    .select('tier, is_beta_user')
    .eq('user_id', user.id)
    .single()

  if (existing?.is_beta_user || existing?.tier === 'beta_vip') {
    return Response.json({ ok: true, alreadyClaimed: true, message: '你已经是内测用户了！' })
  }

  // Count current beta users
  const { count } = await admin
    .from('user_quota')
    .select('*', { count: 'exact', head: true })
    .eq('is_beta_user', true)

  const claimed = count ?? 0
  if (claimed >= BETA_TOTAL_SLOTS) {
    return Response.json({ error: 'BETA_FULL', message: '100 个内测名额已全部抢光！' }, { status: 409 })
  }

  // Grant beta VIP
  const { error } = await admin.from('user_quota').upsert(
    {
      user_id: user.id,
      tier: 'beta_vip',
      is_beta_user: true,
      chat_count_monthly_limit: BETA_MONTHLY_LIMIT,
      chat_count_monthly_used: 0,
      chat_count_daily_limit: 50,
      monthly_reset_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    console.error('[beta/claim] upsert error:', error)
    return Response.json({ error: 'Failed to claim beta spot' }, { status: 500 })
  }

  console.log('[beta/claim] userId=%s claimed spot #%d', user.id, claimed + 1)
  return Response.json({
    ok: true,
    alreadyClaimed: false,
    spotsLeft: BETA_TOTAL_SLOTS - claimed - 1,
    message: '内测额度已到账！',
  })
}
