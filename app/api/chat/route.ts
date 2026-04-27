import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UsageData {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

const FREE_TIER_LIMIT = 100_000

export async function POST(req: Request) {
  const { messages, customInstructions, aiLang } = await req.json()

  // --- Auth + Quota check ---
  let userId: string | null = null
  let supabaseClient: Awaited<ReturnType<typeof createClient>> | null = null

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      supabaseClient = await createClient()
      const { data: { user } } = await supabaseClient.auth.getUser()

      if (user) {
        userId = user.id

        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const [usageResult, quotaResult] = await Promise.all([
          supabaseClient
            .from('token_usage')
            .select('total_tokens')
            .eq('user_id', user.id)
            .gte('created_at', startOfMonth.toISOString()),
          supabaseClient
            .from('user_quota')
            .select('monthly_token_limit, tier')
            .eq('user_id', user.id)
            .single(),
        ])

        const usedTokens = (usageResult.data ?? []).reduce(
          (sum: number, row: { total_tokens: number }) => sum + row.total_tokens,
          0
        )
        const limit = quotaResult.data?.monthly_token_limit ?? FREE_TIER_LIMIT
        const tier = quotaResult.data?.tier ?? 'free'

        if (tier === 'free' && usedTokens >= limit) {
          return new Response(
            JSON.stringify({ error: 'TOKEN_LIMIT_EXCEEDED', usedTokens, limit }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    } catch {
      // Supabase 不可用时跳过配额检查，继续提供服务
    }
  }

  // --- System prompt ---
  const langInstruction = aiLang === 'en'
    ? '\n\nPlease respond in English.'
    : ''
  const customPart = customInstructions?.trim()
    ? `\n\n## 用户补充说明\n${customInstructions.trim()}`
    : ''

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

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [systemMessage, ...messages],
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    console.error('[chat] DeepSeek error', response.status, errorBody)
    return new Response(
      JSON.stringify({ error: 'AI_SERVICE_ERROR', status: response.status }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Promise that resolves to usage data when stream finishes
  let resolveUsage!: (u: UsageData | null) => void
  const usagePromise = new Promise<UsageData | null>(resolve => {
    resolveUsage = resolve
  })

  // Save token usage AFTER the response is fully streamed (Next.js 15+ after())
  after(async () => {
    if (!userId || !supabaseClient) return
    const usage = await usagePromise
    if (!usage) return
    try {
      await supabaseClient.from('token_usage').insert({
        user_id: userId,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        model: 'deepseek-chat',
      })
    } catch {
      // Non-fatal
    }
  })

  // --- Stream SSE, forward content only ---
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
              // Capture usage from the final message (stream_options.include_usage)
              if (json.usage) {
                capturedUsage = json.usage
              }
              const content = json.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(encoder.encode(content))
              }
            } catch {
              // Ignore unparseable lines
            }
          }
        }
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
