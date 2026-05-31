import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const preferredRegion = ['hkg1', 'sin1']

const BETA_TOTAL_SLOTS = 100
const BETA_MONTHLY_LIMIT = 50  // strictly 50 calls, controls relay cost

export async function POST(req: Request) {
  // ── Auth required ─────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'LOGIN_REQUIRED' }, { status: 401 })
  }

  const admin = createAdminClient()

  // ── Anti-abuse: each UID can claim exactly once ────────────────────────────
  const { data: existing } = await admin
    .from('user_quota')
    .select('tier, is_beta_user')
    .eq('user_id', user.id)
    .single()

  if (existing?.is_beta_user || existing?.tier === 'beta_vip') {
    return Response.json({ ok: true, alreadyClaimed: true, message: '你已经是内测用户了！' })
  }

  // ── Check remaining slots ─────────────────────────────────────────────────
  const { count } = await admin
    .from('user_quota')
    .select('*', { count: 'exact', head: true })
    .eq('is_beta_user', true)

  const claimed = count ?? 0
  if (claimed >= BETA_TOTAL_SLOTS) {
    return Response.json({ error: 'BETA_FULL', message: '100 个内测名额已全部抢光！' }, { status: 409 })
  }

  // ── Parse registration profile ─────────────────────────────────────────────
  let profile: { nickname?: string; twitter?: string; useCase?: string; source?: string } = {}
  try { profile = await req.json() } catch {}

  // ── Grant BETA_VIP with strictly 50 calls ─────────────────────────────────
  const { error: quotaError } = await admin.from('user_quota').upsert(
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
  if (quotaError) {
    console.error('[beta/claim] quota upsert error:', quotaError)
    return Response.json({ error: 'Failed to claim beta spot' }, { status: 500 })
  }

  // ── Save registration profile (non-blocking) ──────────────────────────────
  if (profile.nickname || profile.twitter || profile.useCase || profile.source) {
    await admin.from('beta_profiles').upsert(
      {
        user_id: user.id,
        email: user.email ?? '',
        nickname: profile.nickname ?? null,
        twitter_handle: profile.twitter ?? null,
        use_case: profile.useCase ?? null,
        referral_source: profile.source ?? null,
      },
      { onConflict: 'user_id' }
    ).then(({ error }) => {
      if (error) console.error('[beta/claim] profile save error:', error)
    })
  }

  console.log('[beta/claim] ✓ userId=%s spot#=%d', user.id, claimed + 1)
  return Response.json({
    ok: true,
    alreadyClaimed: false,
    spotsLeft: BETA_TOTAL_SLOTS - claimed - 1,
    message: '内测名额已到账！',
  })
}
