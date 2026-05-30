import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkGuestLimits, checkFreeUserRateLimit } from '@/lib/rate-limit'

export const preferredRegion = ['hkg1', 'sin1']
export const maxDuration = 60

// Sentinel appended at the end of the stream carrying the AI-generated branch title.
export const TITLE_MARKER = '\n\n__MW_TITLE__'

// ── Types ────────────────────────────────────────────────────────────────────

interface AiModel {
  id: string
  display_name: string
  relay_model_id: string
  tier_required: 'free' | 'vip'
  is_active: boolean
  sort_order: number
}

interface UsageData {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// ── Defaults / fallbacks ──────────────────────────────────────────────────────

const DEFAULT_MODELS: AiModel[] = [
  { id: 'deepseek-r1', display_name: 'DeepSeek R1', relay_model_id: 'deepseek-chat', tier_required: 'free', is_active: true, sort_order: 1 },
]

// ── Model cache (5 min TTL) ───────────────────────────────────────────────────

let modelsCache: { data: AiModel[]; expiresAt: number } = {
  data: DEFAULT_MODELS,
  expiresAt: 0,
}

async function getActiveModels(supabase: Awaited<ReturnType<typeof createClient>>): Promise<AiModel[]> {
  if (Date.now() < modelsCache.expiresAt) return modelsCache.data
  try {
    const { data, error } = await supabase
      .from('ai_models')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (!error && data?.length) {
      modelsCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 }
      return data
    }
  } catch {}
  return DEFAULT_MODELS
}

// ── Quota cache (token-based legacy, 5 min TTL) ───────────────────────────────

const FREE_TIER_TOKEN_LIMIT = 100_000
const quotaCache = new Map<string, { tier: string; usedTokens: number; tokenLimit: number; expiresAt: number }>()

async function getCachedTokenQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ tier: string; usedTokens: number; tokenLimit: number }> {
  const cached = quotaCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    return { tier: cached.tier, usedTokens: cached.usedTokens, tokenLimit: cached.tokenLimit }
  }
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const [usageResult, quotaResult] = await Promise.all([
    supabase.from('token_usage').select('total_tokens').eq('user_id', userId).gte('created_at', startOfMonth.toISOString()),
    supabase.from('user_quota').select('monthly_token_limit, tier').eq('user_id', userId).single(),
  ])
  const data = {
    tier: quotaResult.data?.tier ?? 'free',
    usedTokens: (usageResult.data ?? []).reduce((sum: number, row: { total_tokens: number }) => sum + row.total_tokens, 0),
    tokenLimit: quotaResult.data?.monthly_token_limit ?? FREE_TIER_TOKEN_LIMIT,
  }
  quotaCache.set(userId, { ...data, expiresAt: Date.now() + 5 * 60 * 1000 })
  return data
}

// ── Count-based quota (Task E columns, soft fallback if DDL not run yet) ──────

interface ChatCount {
  dailyUsed: number
  dailyLimit: number
  dailyResetAt: string | null
  monthlyUsed: number
  monthlyLimit: number
  monthlyResetAt: string | null
}

async function getChatCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ChatCount | null> {
  try {
    const { data, error } = await supabase
      .from('user_quota')
      .select('chat_count_daily_used, chat_count_daily_limit, daily_reset_at, chat_count_monthly_used, chat_count_monthly_limit, monthly_reset_at')
      .eq('user_id', userId)
      .single()
    if (error || !data) return null
    return {
      dailyUsed: data.chat_count_daily_used ?? 0,
      dailyLimit: data.chat_count_daily_limit ?? 50,
      dailyResetAt: data.daily_reset_at ?? null,
      monthlyUsed: data.chat_count_monthly_used ?? 0,
      monthlyLimit: data.chat_count_monthly_limit ?? 0,
      monthlyResetAt: data.monthly_reset_at ?? null,
    }
  } catch {
    return null // columns not yet added — fall through to legacy token quota
  }
}

// ── Content moderation (Task F) ───────────────────────────────────────────────

async function isContentAllowed(text: string): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return true // no moderation key → skip check
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    })
    if (!res.ok) return true // moderation service unavailable → allow
    const { results } = await res.json()
    return !results?.[0]?.flagged
  } catch {
    return true // on error → allow (don't block users for infra issues)
  }
}

// ── Branch title generation ───────────────────────────────────────────────────

async function generateBranchTitle(userMessage: string): Promise<string> {
  const baseUrl = process.env.AI_RELAY_BASE_URL ?? 'https://api.deepseek.com'
  const apiKey = process.env.AI_RELAY_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: `根据以下用户消息，生成一个2-5个字的简短中文标题，概括核心话题。只输出标题本身，不加任何标点、引号或解释。\n\n用户消息：${userMessage}` }],
        max_tokens: 20,
      }),
    })
    if (!res.ok) return '新分支'
    const json = await res.json()
    return json.choices?.[0]?.message?.content?.trim() ?? '新分支'
  } catch {
    return '新分支'
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages, model: requestedModelId, customInstructions, aiLang, firstUserMessage } = await req.json()

  // Start title generation immediately (runs in parallel with auth + AI call)
  const titlePromise: Promise<string | null> = firstUserMessage
    ? generateBranchTitle(firstUserMessage as string)
    : Promise.resolve(null)

  // ── Auth & identity ──────────────────────────────────────────────────────────
  let userId: string | null = null
  let userTier = 'guest'
  let supabaseClient: Awaited<ReturnType<typeof createClient>> | null = null
  const isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (isSupabaseConfigured) {
    try {
      supabaseClient = await createClient()
      const { data: { user } } = await supabaseClient.auth.getUser()

      if (user) {
        userId = user.id
        const tokenQuota = await getCachedTokenQuota(supabaseClient, user.id)
        userTier = tokenQuota.tier
        console.log('[chat] uid=%s tier=%s tokens=%d/%d', userId, userTier, tokenQuota.usedTokens, tokenQuota.tokenLimit)

        // ── Check count-based quota (Task E) ──
        const countData = await getChatCount(supabaseClient, user.id)
        if (countData) {
          if (userTier !== 'vip') {
            // FREE: daily count
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const isNewDay = !countData.dailyResetAt || new Date(countData.dailyResetAt) < todayStart
            const effectiveDailyUsed = isNewDay ? 0 : countData.dailyUsed
            if (effectiveDailyUsed >= countData.dailyLimit) {
              return Response.json(
                { error: 'DAILY_LIMIT_EXCEEDED', used: effectiveDailyUsed, limit: countData.dailyLimit },
                { status: 429 }
              )
            }
          } else if (countData.monthlyLimit > 0) {
            // VIP: monthly count
            const startOfMonth = new Date()
            startOfMonth.setDate(1)
            startOfMonth.setHours(0, 0, 0, 0)
            const isNewMonth = !countData.monthlyResetAt || new Date(countData.monthlyResetAt) < startOfMonth
            const effectiveMonthlyUsed = isNewMonth ? 0 : countData.monthlyUsed
            if (effectiveMonthlyUsed >= countData.monthlyLimit) {
              return Response.json(
                { error: 'MONTHLY_LIMIT_EXCEEDED', used: effectiveMonthlyUsed, limit: countData.monthlyLimit },
                { status: 429 }
              )
            }
          }
        } else {
          // Fallback: legacy token-based limit
          if (userTier === 'free' && tokenQuota.usedTokens >= tokenQuota.tokenLimit) {
            return Response.json(
              { error: 'TOKEN_LIMIT_EXCEEDED', usedTokens: tokenQuota.usedTokens, limit: tokenQuota.tokenLimit },
              { status: 429 }
            )
          }
        }

        // Anti-burst for free users (Redis, if configured)
        if (userTier === 'free') {
          const burst = await checkFreeUserRateLimit(user.id)
          if (!burst.allowed) {
            return Response.json({ error: 'RATE_LIMITED' }, { status: 429 })
          }
        }
      } else {
        // Guest: distributed rate limit
        const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
        const limitResult = await checkGuestLimits(ip)
        if (!limitResult.allowed) {
          return Response.json({ error: limitResult.error }, { status: 429 })
        }
      }
    } catch (e) {
      console.error('[chat] auth block threw:', e)
    }
  }

  // ── Model validation (Task D) ────────────────────────────────────────────────
  const modelId = (requestedModelId as string | undefined) || 'deepseek-r1'
  let selectedModel: AiModel = DEFAULT_MODELS[0]

  if (supabaseClient) {
    const models = await getActiveModels(supabaseClient)
    const found = models.find(m => m.id === modelId)
    if (found) selectedModel = found
  }

  if (selectedModel.tier_required === 'vip' && userTier !== 'vip') {
    return Response.json({ error: 'MODEL_NOT_ALLOWED' }, { status: 403 })
  }

  // ── Content moderation (Task F) ──────────────────────────────────────────────
  const lastUserMsg = (messages as { role: string; content: string }[]).filter(m => m.role === 'user').at(-1)?.content
  if (lastUserMsg) {
    const allowed = await isContentAllowed(lastUserMsg)
    if (!allowed) {
      return Response.json({ error: 'CONTENT_VIOLATION' }, { status: 451 })
    }
  }

  // ── System prompt ────────────────────────────────────────────────────────────
  const langInstruction = aiLang === 'en' ? '\n\nPlease respond in English.' : ''
  const customPart = customInstructions?.trim() ? `\n\n## 用户补充说明\n${customInstructions.trim()}` : ''

  const systemMessage = {
    role: 'system',
    content: `你是用户的私人思考伙伴，运行在一个树状对话工具里。

工具特点：每条对话可以分叉成多个方向，用户在不同分支里分别深入探索。
你的职责是帮助用户把一个方向想深、想透，并在适当时候点出值得拆开探索的岔路。

## 回答原则

**内容**
- 直接给结论和判断，不做信息罗列，不中立骑墙
- 优先给用户没想到的角度，而不是重复他已经知道的
- 遇到前提有问题的问题，先指出前提，再回答

**格式**
- 简单问题：纯文本，3-5句，不用结构
- 复杂问题：用 ## 标题 + 列表 + **粗体**，但不要过度分节
- 代码用代码块，始终 Markdown

**篇幅**
- 默认控制在 300 字以内
- 用户明确要求详细分析时可突破

## 结尾格式（每次必须执行）

正文结束后，另起一行，输出：

---
**可以继续探索：**
- [方向一，8字以内，动词开头]
- [方向二，8字以内]
- [方向三，8字以内]

这三个方向要真正有价值、互相不重叠、让用户看到就想点开。不要写"深入了解XX"这类废话。${langInstruction}${customPart}`,
  }

  // ── AI call (relay or direct DeepSeek) ───────────────────────────────────────
  const relayBaseUrl = process.env.AI_RELAY_BASE_URL ?? 'https://api.deepseek.com'
  const relayApiKey = process.env.AI_RELAY_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''

  const response = await fetch(`${relayBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel.relay_model_id,
      messages: [systemMessage, ...messages],
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    console.error('[chat] AI error', response.status, errorBody)
    return Response.json(
      { error: 'AI_SERVICE_ERROR', aiStatus: response.status },
      { status: 502 }
    )
  }

  // ── Async post-stream tasks ───────────────────────────────────────────────────
  let resolveUsage!: (u: UsageData | null) => void
  const usagePromise = new Promise<UsageData | null>(resolve => { resolveUsage = resolve })

  after(async () => {
    if (!userId || !supabaseClient) return
    const usage = await usagePromise

    // Increment chat count (Task E)
    try {
      await supabaseClient.rpc('increment_chat_count', { uid: userId, is_vip: userTier === 'vip' })
    } catch {
      // DDL not yet applied — non-fatal
    }

    // Record token usage (legacy, also invalidates quota cache)
    if (usage) {
      try {
        await supabaseClient.from('token_usage').insert({
          user_id: userId,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          model: selectedModel.relay_model_id,
        })
        quotaCache.delete(userId)
      } catch {
        // Non-fatal
      }
    }
  })

  // ── Stream SSE, forward content only ─────────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let capturedUsage: UsageData | null = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const json = JSON.parse(data)
              if (json.usage) capturedUsage = json.usage
              const content = json.choices?.[0]?.delta?.content
              if (content) controller.enqueue(encoder.encode(content))
            } catch {}
          }
        }

        // Append branch title (parallel generation, should be ready by now)
        const title = await titlePromise
        if (title) controller.enqueue(encoder.encode(TITLE_MARKER + JSON.stringify({ title })))

        controller.close()
        resolveUsage(capturedUsage)
      } catch (err) {
        controller.error(err)
        resolveUsage(null)
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
