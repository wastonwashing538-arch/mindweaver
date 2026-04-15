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

  const [usageResult, quotaResult] = await Promise.all([
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
  ])

  const rows = usageResult.data ?? []
  const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0)
  const promptTokens = rows.reduce((s, r) => s + r.prompt_tokens, 0)
  const completionTokens = rows.reduce((s, r) => s + r.completion_tokens, 0)

  return NextResponse.json({
    currentMonth: {
      total: totalTokens,
      prompt: promptTokens,
      completion: completionTokens,
      callCount: rows.length,
    },
    quota: {
      limit: quotaResult.data?.monthly_token_limit ?? 100000,
      tier: quotaResult.data?.tier ?? 'free',
    },
  })
}
