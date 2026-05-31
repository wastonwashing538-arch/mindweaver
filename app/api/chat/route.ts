import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkGuestLimits } from '@/lib/rate-limit'

export const preferredRegion = ['hkg1', 'sin1']
export const maxDuration = 60

export const TITLE_MARKER = '\n\n__MW_TITLE__'

// ── Dual-channel config (read from env, never hardcoded) ──────────────────────

const FREE_CHANNEL = {
  baseUrl: process.env.DEEPSEEK_OFFICIAL_BASE_URL ?? 'https://api.deepseek.com',
  apiKey:  process.env.DEEPSEEK_OFFICIAL_API_KEY  ?? process.env.DEEPSEEK_API_KEY ?? '',
  model:   process.env.FREE_MODEL_ID              ?? 'deepseek-reasoner',
}

const VIP_CHANNEL = {
  baseUrl: process.env.RELAY_CLAUDE_BASE_URL ?? '',
  apiKey:  process.env.RELAY_CLAUDE_API_KEY  ?? '',
  model:   process.env.VIP_MODEL_ID          ?? 'anthropic/claude-sonnet-4.6',
}

// ── Step 1: Cloudflare Turnstile ──────────────────────────────────────────────

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true  // not configured → skip (dev mode)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const { success } = await res.json()
    return success === true
  } catch {
    return true  // on infra error → allow
  }
}

// ── Step 2: OpenAI content moderation ────────────────────────────────────────

async function isContentAllowed(text: string): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return true
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    })
    if (!res.ok) return true
    const { results } = await res.json()
    return !results?.[0]?.flagged
  } catch {
    return true
  }
}

// ── Step 3: User quota (admin client bypasses RLS) ────────────────────────────

interface Quota {
  tier: 'free' | 'starter' | 'standard' | 'vip' | 'beta_vip'
  dailyUsed: number
  dailyLimit: number
  monthlyUsed: number
  monthlyLimit: number
}

async function getUserQuota(userId: string): Promise<Quota> {
  const DEFAULT: Quota = { tier: 'free', dailyUsed: 0, dailyLimit: 50, monthlyUsed: 0, monthlyLimit: 0 }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_quota')
      .select('tier, chat_count_daily_used, chat_count_daily_limit, daily_reset_at, chat_count_monthly_used, chat_count_monthly_limit, monthly_reset_at')
      .eq('user_id', userId)
      .single()
    if (error || !data) return DEFAULT

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const isNewDay   = !data.daily_reset_at   || new Date(data.daily_reset_at)   < todayStart
    const isNewMonth = !data.monthly_reset_at || new Date(data.monthly_reset_at) < monthStart

    return {
      tier:         (data.tier ?? 'free') as 'free' | 'starter' | 'standard' | 'vip' | 'beta_vip',
      dailyUsed:    isNewDay   ? 0 : (data.chat_count_daily_used   ?? 0),
      dailyLimit:   data.chat_count_daily_limit   ?? 50,
      monthlyUsed:  isNewMonth ? 0 : (data.chat_count_monthly_used ?? 0),
      monthlyLimit: data.chat_count_monthly_limit ?? 0,
    }
  } catch {
    return DEFAULT
  }
}

// ── Title generation (always uses free channel — cheap, fast) ─────────────────

async function generateBranchTitle(userMessage: string): Promise<string> {
  if (!FREE_CHANNEL.apiKey) return '新分支'
  try {
    const res = await fetch(`${FREE_CHANNEL.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FREE_CHANNEL.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FREE_CHANNEL.model,
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

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(customInstructions: string, aiLang: string, presetInstruction?: string): string {
  const langNote = aiLang === 'en' ? '\n\nPlease respond in English.' : ''
  const customPart = customInstructions?.trim() ? `\n\n## 用户补充说明\n${customInstructions.trim()}` : ''
  const presetPart = presetInstruction?.trim() ? `\n\n## 专家工作台模式（覆盖默认行为）\n${presetInstruction.trim()}` : ''
  return `你是用户的私人思考伙伴，运行在一个树状对话工具里。

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

这三个方向要真正有价值、互相不重叠、让用户看到就想点开。不要写"深入了解XX"这类废话。${presetPart}${langNote}${customPart}`
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages, customInstructions, aiLang, firstUserMessage, turnstileToken, presetInstruction } = await req.json()
  const ip = (req.headers.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim()

  // Start title generation in parallel — it's non-blocking and uses free channel
  const titlePromise = firstUserMessage
    ? generateBranchTitle(firstUserMessage as string)
    : Promise.resolve(null)

  // ── STEP 1: Turnstile ────────────────────────────────────────────────────────
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  if (turnstileSecret) {
    // In production (secret is set), a valid token is required
    if (!turnstileToken) {
      return Response.json({ error: 'TURNSTILE_REQUIRED' }, { status: 403 })
    }
    const valid = await verifyTurnstile(turnstileToken as string, ip)
    if (!valid) {
      return Response.json({ error: 'TURNSTILE_FAILED' }, { status: 403 })
    }
  }

  // ── STEP 2: Content moderation ───────────────────────────────────────────────
  const lastUserMsg = (messages as { role: string; content: string }[])
    .filter(m => m.role === 'user').at(-1)?.content
  if (lastUserMsg) {
    const allowed = await isContentAllowed(lastUserMsg)
    if (!allowed) {
      return Response.json({ error: 'CONTENT_VIOLATION' }, { status: 451 })
    }
  }

  // ── STEP 3: Auth → quota check → channel selection ───────────────────────────
  let userId: string | null = null
  let isVip = false

  // Selected channel — default to free, backend overrides per tier
  let channel = FREE_CHANNEL

  const isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        userId = user.id
        const quota = await getUserQuota(user.id)
        isVip = quota.tier !== 'free'

        if (isVip) {
          // VIP: enforce monthly limit (if configured)
          if (quota.monthlyLimit > 0 && quota.monthlyUsed >= quota.monthlyLimit) {
            return Response.json(
              { error: 'MONTHLY_LIMIT_EXCEEDED', used: quota.monthlyUsed, limit: quota.monthlyLimit },
              { status: 429 }
            )
          }
          // VIP channel — backend hardcodes, ignores any frontend model param
          channel = VIP_CHANNEL
          if (!channel.baseUrl || !channel.apiKey) {
            return Response.json({ error: 'VIP_CHANNEL_NOT_CONFIGURED' }, { status: 503 })
          }
        } else {
          // FREE: enforce daily limit
          if (quota.dailyUsed >= quota.dailyLimit) {
            return Response.json(
              { error: 'DAILY_LIMIT_EXCEEDED', used: quota.dailyUsed, limit: quota.dailyLimit },
              { status: 429 }
            )
          }
          // FREE channel — backend hardcodes DeepSeek R1
          channel = FREE_CHANNEL
        }

        console.log('[chat] uid=%s tier=%s channel=%s', userId, quota.tier, isVip ? 'VIP/Claude' : 'FREE/DeepSeek')
      } else {
        // Guest — Redis rate limit, free channel
        const limitResult = await checkGuestLimits(ip)
        if (!limitResult.allowed) {
          return Response.json({ error: limitResult.error }, { status: 429 })
        }
        channel = FREE_CHANNEL
      }
    } catch (e) {
      console.error('[chat] auth/quota error:', e)
    }
  }

  // ── STEP 4: Stream AI response ────────────────────────────────────────────────
  const systemMessage = { role: 'system', content: buildSystemPrompt(customInstructions ?? '', aiLang ?? 'zh', presetInstruction) }

  const response = await fetch(`${channel.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channel.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: channel.model,
      messages: [systemMessage, ...messages],
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    console.error('[chat] AI error %d channel=%s body=%s', response.status, isVip ? 'vip' : 'free', errorBody.slice(0, 200))
    return Response.json({ error: 'AI_SERVICE_ERROR', aiStatus: response.status }, { status: 502 })
  }

  // ── STEP 5: Decrement count after stream (in after(), non-blocking) ───────────
  after(async () => {
    if (!userId) return
    try {
      const admin = createAdminClient()
      await admin.rpc('increment_chat_count', { uid: userId, is_vip: isVip })
    } catch {
      // Non-fatal — count columns may not exist yet
    }
  })

  // ── Stream SSE, forward content only ─────────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              const content = json.choices?.[0]?.delta?.content
              if (content) controller.enqueue(encoder.encode(content))
            } catch {}
          }
        }

        // Append branch title (should be ready by now)
        const title = await titlePromise
        if (title) controller.enqueue(encoder.encode(TITLE_MARKER + JSON.stringify({ title })))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
