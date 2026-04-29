export const preferredRegion = ['hkg1', 'sin1']
export const maxDuration = 30

export async function POST(req: Request) {
  const { userMessage } = await req.json()

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: `根据以下用户消息，生成一个2-5个字的简短中文标题，概括核心话题。只输出标题本身，不加任何标点、引号或解释。\n\n用户消息：${userMessage}`,
        },
      ],
      max_tokens: 20,
    }),
  })

  if (!response.ok) {
    return Response.json({ title: '新分支' })
  }

  const json = await response.json()
  const title = json.choices?.[0]?.message?.content?.trim() ?? '新分支'

  return Response.json({ title })
}
