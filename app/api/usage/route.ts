import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Parallel: token usage + quota (base) + quota count columns
  const [usageResult, quotaResult, countResult] = await Promise.all([
    supabase
      .from('token_usage')
      .select('prompt_tokens, completion_tokens, total_tokens')
      .eq('user_id', user.id)
      .gte('created_at', startOfMonth.toISOString()),
    supabase
      .from('user_quota')
      .select('monthly_token_limit, tier')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('user_quota')
      .select('chat_count_daily_used, chat_count_daily_limit, daily_reset_at, chat_count_monthly_used, chat_count_monthly_limit, monthly_reset_at, subscription_expires_at')
      .eq('user_id', user.id)
      .single()
      .then(r => r)  // non-throwing wrapper
      .catch(() => ({ data: null, error: 'columns_missing' })),
  ])

  const rows = usageResult.data ?? []
  const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0)
  const promptTokens = rows.reduce((s, r) => s + r.prompt_tokens, 0)
  const completionTokens = rows.reduce((s, r) => s + r.completion_tokens, 0)

  const tier = quotaResult.data?.tier ?? 'free'
  const tokenLimit = quotaResult.data?.monthly_token_limit ?? 100000

  // Count-based quota (Task E columns — may not exist until DDL is run)
  const countData = countResult.data
  let chatQuota: Record<string, unknown> | null = null
  if (countData) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const dailyReset = countData.daily_reset_at ? new Date(countData.daily_reset_at) : null
    const monthlyReset = countData.monthly_reset_at ? new Date(countData.monthly_reset_at) : null

    const isNewDay = !dailyReset || dailyReset < todayStart
    const isNewMonth = !monthlyReset || monthlyReset < monthStart

    chatQuota = {
      dailyUsed: isNewDay ? 0 : (countData.chat_count_daily_used ?? 0),
      dailyLimit: countData.chat_count_daily_limit ?? 50,
      monthlyUsed: isNewMonth ? 0 : (countData.chat_count_monthly_used ?? 0),
      monthlyLimit: countData.chat_count_monthly_limit ?? 0,
      subscriptionExpiresAt: countData.subscription_expires_at ?? null,
    }
  }

  return NextResponse.json({
    currentMonth: {
      total: totalTokens,
      prompt: promptTokens,
      completion: completionTokens,
      callCount: rows.length,
    },
    quota: {
      limit: tokenLimit,
      tier,
    },
    chatQuota,  // null if DDL not yet applied
  })
}
